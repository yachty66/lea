import { neon } from "@neondatabase/serverless";
import { fanvueFetch } from "@/lib/fanvue";

const HISTORY = 24;

// Atomically claim a fan message so only one concurrent trigger (webhook + poll,
// or duplicate webhook deliveries) ever replies to it. Returns true if we won.
// Dedupe a webhook by its event id. Fanvue delivers at-least-once (the same
// event can arrive multiple times), so the FIRST thing every delivery does is
// try to claim its event id — only the first delivery of an event proceeds.
export async function claimEvent(eventId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    insert into fanvue_events (event_id) values (${eventId})
    on conflict do nothing returning event_id`;
  return rows.length > 0;
}

// Queue a photo for the always-on worker to generate + upload + send. Photo
// generation is too slow (~40s) to run inside the serverless webhook.
async function enqueuePhoto(fanUuid: string, prompt: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await neon(process.env.DATABASE_URL)`
      insert into fanvue_photo_jobs (fan_uuid, prompt) values (${fanUuid}, ${prompt})`;
  } catch {
    /* ignore */
  }
}

async function claim(fanUuid: string, messageUuid: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false; // refuse rather than risk a duplicate
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    insert into fanvue_handled (fan_uuid, message_uuid)
    values (${fanUuid}, ${messageUuid})
    on conflict do nothing
    returning message_uuid`;
  return rows.length > 0;
}

type FanvueMessage = {
  uuid: string;
  text?: string | null;
  sender?: { uuid?: string };
  hasMedia?: boolean | null;
};

let selfUuidCache: string | null = null;

async function selfUuid(): Promise<string> {
  if (selfUuidCache) return selfUuidCache;
  const res = await fanvueFetch("/users/me");
  const data = await res.json();
  selfUuidCache = data.uuid as string;
  return selfUuidCache;
}

function internal(path: string, origin: string, bodyObj: unknown) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-lea-service": process.env.LEA_SERVICE_SECRET! },
    body: JSON.stringify(bodyObj),
  });
}

async function describeInbound(fanUuid: string, messageUuid: string, origin: string): Promise<string> {
  try {
    const res = await fanvueFetch(`/chats/${fanUuid}/messages/${messageUuid}/media`);
    if (!res.ok) return "";
    const media = await res.json();
    const first = Object.values(media?.results ?? {})[0] as
      | { variants?: { variantType?: string; url?: string }[] }
      | undefined;
    const mainUrl = first?.variants?.find((v) => v.variantType === "main")?.url;
    if (!mainUrl) return "";
    const vis = await internal("/api/vision", origin, { image: mainUrl });
    if (!vis.ok) return "";
    const data = await vis.json();
    return typeof data.description === "string" ? data.description : "";
  } catch {
    return "";
  }
}

export async function processChat(fanUuid: string, origin: string): Promise<boolean> {
  const me = await selfUuid();
  const listRes = await fanvueFetch(`/chats/${fanUuid}/messages?size=${HISTORY}`);
  if (!listRes.ok) return false;
  const msgs = ((await listRes.json()).data ?? []) as FanvueMessage[];
  const ordered = [...msgs].reverse(); // API returns newest-first
  const last = ordered[ordered.length - 1];
  if (!last || last.sender?.uuid === me) return false; // nothing new / we already answered

  if (!(await claim(fanUuid, last.uuid))) return false;
  return runReply(fanUuid, last.uuid, ordered, me, origin);
}

// Claim (never released) is already won by processChat before we get here.
async function runReply(
  fanUuid: string,
  lastUuid: string,
  ordered: FanvueMessage[],
  me: string,
  origin: string
): Promise<boolean> {
  try {
    return await reply(fanUuid, lastUuid, ordered, me, origin);
  } catch (e) {
    console.error("reply error (claim kept):", (e as Error).message);
    return false;
  }
}

async function reply(
  fanUuid: string,
  lastUuid: string,
  ordered: FanvueMessage[],
  me: string,
  origin: string
): Promise<boolean> {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of ordered) {
    const fromFan = m.sender?.uuid !== me;
    let content = (m.text ?? "").trim();
    if (m.hasMedia && fromFan) {
      const desc = (await describeInbound(fanUuid, m.uuid, origin)) || "keine beschreibung verfügbar";
      content = `${content}\n[er schickt dir ein foto. darauf zu sehen: ${desc}]`.trim();
    }
    if (!content) continue;
    history.push({ role: fromFan ? "user" : "assistant", content });
  }
  if (!history.length || history[history.length - 1].role !== "user") return false;

  const result = await internal("/api/chat", origin, { messages: history }).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`chat ${r.status}`))
  );
  const text = (result.text ?? "").trim();
  const wantsPhoto = typeof result.photoPrompt === "string";

  // Belt-and-suspenders: after the ~7s generation, make sure no other trigger
  // already answered while we were thinking. If Lea is now the last sender, bail.
  const latest = await fanvueFetch(`/chats/${fanUuid}/messages?size=1`);
  if (latest.ok) {
    const newest = ((await latest.json()).data ?? [])[0] as FanvueMessage | undefined;
    if (newest && newest.sender?.uuid === me) return false;
  }

  const send = (body: Record<string, unknown>) =>
    fanvueFetch(`/chats/${fanUuid}/message`, { method: "POST", body: JSON.stringify(body) });

  let sent = false;

  // 1) Text first — arrives fast, before the slow photo work.
  if (text) {
    if ((await send({ text })).ok) sent = true;
  }

  // 2) Photo: queue it for the always-on worker (generation is ~40s, too slow
  //    for this serverless function). The worker generates, uploads and sends it
  //    as a follow-up message. The text reply above already counts as sent.
  if (wantsPhoto) {
    await enqueuePhoto(fanUuid, (result.photoPrompt as string) || "casual selfie, soft light");
    sent = true;
  }

  // 3) Never ghost the fan — but only if we truly sent nothing.
  if (!sent) {
    if ((await send({ text: "sek, handy hängt grad 🙈 was wolltest du sehen?" })).ok) sent = true;
  }
  return sent;
}

// Answer any chat whose latest message is from the fan. We can't rely on the
// unread flag (reading messages via the API clears it), so we look at the last
// message's sender on the chat list instead. The per-message claim dedupes.
export async function sweepUnread(origin: string): Promise<number> {
  const me = await selfUuid();
  const res = await fanvueFetch(`/chats?sortBy=most_recent_messages&size=20`);
  if (!res.ok) return 0;
  const chats = ((await res.json()).data ?? []) as {
    user?: { uuid?: string };
    lastMessage?: { senderUuid?: string } | null;
  }[];
  let handled = 0;
  for (const c of chats) {
    const fanUuid = c.user?.uuid;
    const sender = c.lastMessage?.senderUuid;
    // Only chats where the fan spoke last and we haven't answered.
    if (!fanUuid || !sender || sender === me) continue;
    try {
      if (await processChat(fanUuid, origin)) handled++;
    } catch (e) {
      console.error("processChat error:", (e as Error).message);
    }
  }
  return handled;
}

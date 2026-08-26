import { neon } from "@neondatabase/serverless";
import { fanvueFetch } from "@/lib/fanvue";

const HISTORY = 24;

// Atomically claim a fan message so only one concurrent trigger (webhook + poll,
// or duplicate webhook deliveries) ever replies to it. Returns true if we won.
export async function dbg(source: string, note: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await neon(process.env.DATABASE_URL)`insert into fanvue_debug (source, note) values (${source}, ${note})`;
  } catch {
    /* ignore */
  }
}

async function claim(fanUuid: string, messageUuid: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    await dbg("claim", "NO DATABASE_URL - cannot dedup");
    return false; // refuse to proceed rather than risk a duplicate
  }
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    insert into fanvue_handled (fan_uuid, message_uuid)
    values (${fanUuid}, ${messageUuid})
    on conflict do nothing
    returning message_uuid`;
  await dbg("claim", `msg=${messageUuid.slice(0, 8)} rows=${rows.length}`);
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

async function uploadPhoto(fanUuid: string, imageUrl: string): Promise<string | null> {
  const img = await fetch(imageUrl);
  if (!img.ok) return null;
  const bytes = Buffer.from(await img.arrayBuffer());
  const filename = `lea-${Date.now()}.jpg`;

  const createdRes = await fanvueFetch("/media/uploads", {
    method: "POST",
    body: JSON.stringify({ name: filename, filename, mediaType: "image", sizeBytes: bytes.length }),
  });
  if (!createdRes.ok) return null;
  const created = await createdRes.json();
  const uploadId = created.uploadId || created.uuid || created.id;

  const parts = created.parts || created.uploadParts || [];
  if (parts.length) {
    const chunkSize = Math.ceil(bytes.length / parts.length);
    for (const part of parts) {
      const url = part.url || part.uploadUrl;
      const n = part.partNumber ?? part.number ?? 1;
      const slice = bytes.subarray((n - 1) * chunkSize, n * chunkSize);
      const put = await fetch(url, { method: "PUT", body: slice });
      if (!put.ok) return null;
    }
  } else if (created.uploadUrl || created.url) {
    const put = await fetch(created.uploadUrl || created.url, { method: "PUT", body: bytes });
    if (!put.ok) return null;
  }

  const doneRes = await fanvueFetch(`/media/uploads/${uploadId}`, {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => null);
  const done = doneRes && doneRes.ok ? await doneRes.json() : null;
  return done?.mediaUuid || done?.uuid || created.mediaUuid || created.uuid || uploadId || null;
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
    await dbg("send", `text for last=${lastUuid.slice(0, 8)}`);
    if ((await send({ text })).ok) sent = true;
  }

  // 2) Photo as a follow-up message (generation + upload is the slow part, so it
  //    never holds up the text). Failure here NEVER undoes the text reply.
  if (wantsPhoto) {
    try {
      const photoRes = await internal("/api/photo", origin, {
        description: (result.photoPrompt as string) || "casual selfie, soft light",
      });
      if (photoRes.ok) {
        const url = (await photoRes.json()).photo as string;
        const uuid = await uploadPhoto(fanUuid, url);
        if (uuid && (await send({ mediaUuids: [uuid] })).ok) sent = true;
      }
    } catch (e) {
      console.error("photo follow-up failed:", (e as Error).message);
    }
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

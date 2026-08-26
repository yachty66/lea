import { fanvueFetch } from "@/lib/fanvue";

const HISTORY = 24;

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

  const chatRes = await internal("/api/chat", origin, { messages: history });
  if (!chatRes.ok) return false;
  const reply = await chatRes.json();
  const text = (reply.text ?? "").trim();

  let mediaUuids: string[] | undefined;
  if (typeof reply.photoPrompt === "string") {
    try {
      const photoRes = await internal("/api/photo", origin, {
        description: reply.photoPrompt || "casual selfie, soft light",
      });
      if (photoRes.ok) {
        const url = (await photoRes.json()).photo as string;
        const uuid = await uploadPhoto(fanUuid, url);
        if (uuid) mediaUuids = [uuid];
      }
    } catch {
      /* text-only fallback */
    }
  }

  if (!text && !mediaUuids) return false;
  const sendBody: Record<string, unknown> = {};
  if (text) sendBody.text = text;
  if (mediaUuids) sendBody.mediaUuids = mediaUuids;
  await fanvueFetch(`/chats/${fanUuid}/message`, { method: "POST", body: JSON.stringify(sendBody) });
  return true;
}

// Fallback safety-net: answer any unread chat.
export async function sweepUnread(origin: string): Promise<number> {
  const res = await fanvueFetch(`/chats?filter=unread&sortBy=most_recent_messages&size=20`);
  if (!res.ok) return 0;
  const chats = ((await res.json()).data ?? []) as { user?: { uuid?: string } }[];
  let handled = 0;
  for (const c of chats) {
    const fanUuid = c.user?.uuid;
    if (!fanUuid) continue;
    try {
      if (await processChat(fanUuid, origin)) handled++;
    } catch (e) {
      console.error("processChat error:", (e as Error).message);
    }
  }
  return handled;
}

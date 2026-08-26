// Lea Fanvue chat worker.
// Polls Lea's Fanvue inbox, runs each fan message through the leaberlin.com
// persona brain (Grok + lea.card.json via /api/chat), and posts her reply back.
// Photos: when the persona emits a [[foto: ...]] intent, we generate one via
// /api/photo, upload it to Fanvue, and attach it. Text-only otherwise.

const BASE = process.env.LEABERLIN_BASE || "https://leaberlin.com";
const SECRET = process.env.LEA_SERVICE_SECRET;
const FANVUE_API = "https://api.fanvue.com";
const API_VERSION = "2025-06-26";
const POLL_MS = Number(process.env.POLL_MS || 8000);
const HISTORY = 24; // messages of context sent to the brain

if (!SECRET) {
  console.error("LEA_SERVICE_SECRET missing");
  process.exit(1);
}

let selfUuid = null;
const handled = new Map(); // fanUuid -> last handled message uuid

async function accessToken() {
  const res = await fetch(`${BASE}/api/fanvue/token`, { headers: { "x-lea-service": SECRET } });
  if (!res.ok) throw new Error(`token ${res.status} ${(await res.text()).slice(0, 120)}`);
  return (await res.json()).access_token;
}

async function fv(path, token, init = {}) {
  const res = await fetch(`${FANVUE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Fanvue-API-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`fanvue ${init.method || "GET"} ${path} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? null : res.json();
}

async function whoAmI(token) {
  if (!selfUuid) selfUuid = (await fv("/users/me", token)).uuid;
  return selfUuid;
}

// Ask the leaberlin brain for Lea's reply. Returns { text, photoPrompt }.
async function leaReply(messages) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-lea-service": SECRET },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`chat ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function generatePhoto(description) {
  const res = await fetch(`${BASE}/api/photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-lea-service": SECRET },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return (await res.json()).photo; // a URL
}

// Upload an image URL to Fanvue's media store, return its uuid (for mediaUuids).
async function uploadPhotoToFanvue(token, imageUrl) {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`fetch image ${img.status}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  const filename = `lea-${Date.now()}.jpg`;

  const created = await fv("/media/uploads", token, {
    method: "POST",
    body: JSON.stringify({ name: filename, filename, mediaType: "image", sizeBytes: bytes.length }),
  });

  const uploadId = created.uploadId || created.uuid || created.id;
  const parts = created.parts || created.uploadParts || [];
  if (parts.length) {
    // Multipart: PUT each part to its presigned URL.
    for (const part of parts) {
      const url = part.url || part.uploadUrl;
      const partNumber = part.partNumber ?? part.number ?? 1;
      const chunkSize = Math.ceil(bytes.length / parts.length);
      const slice = bytes.subarray((partNumber - 1) * chunkSize, partNumber * chunkSize);
      const put = await fetch(url, { method: "PUT", body: slice });
      if (!put.ok) throw new Error(`part ${partNumber} ${put.status}`);
    }
  } else if (created.uploadUrl || created.url) {
    const put = await fetch(created.uploadUrl || created.url, { method: "PUT", body: bytes });
    if (!put.ok) throw new Error(`single put ${put.status}`);
  }

  // Complete the upload.
  const done = await fv(`/media/uploads/${uploadId}`, token, { method: "POST", body: JSON.stringify({}) }).catch(
    () => null
  );
  return done?.mediaUuid || done?.uuid || created.mediaUuid || created.uuid || uploadId;
}

async function sendMessage(token, fanUuid, text, mediaUuids) {
  const body = {};
  if (text) body.text = text;
  if (mediaUuids && mediaUuids.length) body.mediaUuids = mediaUuids;
  await fv(`/chats/${fanUuid}/message`, token, { method: "POST", body: JSON.stringify(body) });
}

async function handleChat(token, chat) {
  const fanUuid = chat.user?.uuid;
  if (!fanUuid) return;

  const me = await whoAmI(token);
  const msgs = (await fv(`/chats/${fanUuid}/messages?size=${HISTORY}`, token)).data || [];
  const ordered = [...msgs].reverse(); // API returns newest-first
  const lastFan = [...ordered].reverse().find((m) => m.sender?.uuid && m.sender.uuid !== me);
  if (!lastFan) return;
  if (handled.get(fanUuid) === lastFan.uuid) return; // already answered this one

  // Build the history for the brain (map Fanvue roles -> our roles).
  const history = [];
  for (const m of ordered) {
    const fromFan = m.sender?.uuid !== me;
    let content = (m.text || "").trim();
    if (m.hasMedia && fromFan) {
      let desc = "keine beschreibung verfügbar";
      try {
        const media = await fv(`/chats/${fanUuid}/messages/${m.uuid}/media`, token);
        const first = Object.values(media?.results || {})[0];
        const mainUrl = first?.variants?.find((v) => v.variantType === "main")?.url;
        if (mainUrl) {
          const vis = await fetch(`${BASE}/api/vision`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-lea-service": SECRET },
            body: JSON.stringify({ image: mainUrl }),
          }).then((r) => (r.ok ? r.json() : null));
          if (vis?.description) desc = vis.description;
        }
      } catch (e) {
        console.error("inbound media:", e.message);
      }
      content = `${content}\n[er schickt dir ein foto. darauf zu sehen: ${desc}]`.trim();
    }
    if (!content) continue;
    history.push({ role: fromFan ? "user" : "assistant", content });
  }
  if (!history.length || history[history.length - 1].role !== "user") return;

  const reply = await leaReply(history);
  const text = (reply.text || "").trim();

  let mediaUuids;
  if (typeof reply.photoPrompt === "string") {
    try {
      const url = await generatePhoto(reply.photoPrompt || "casual selfie, soft light");
      const uuid = await uploadPhotoToFanvue(token, url);
      if (uuid) mediaUuids = [uuid];
    } catch (e) {
      console.error("photo send:", e.message);
    }
  }

  if (text || mediaUuids) {
    await sendMessage(token, fanUuid, text, mediaUuids);
    console.log(`replied to ${fanUuid.slice(0, 8)}${mediaUuids ? " (+photo)" : ""}`);
  }
  handled.set(fanUuid, lastFan.uuid);
}

async function tick() {
  try {
    const token = await accessToken();
    const chats = (await fv(`/chats?filter=unread&sortBy=most_recent_messages&size=20`, token)).data || [];
    for (const chat of chats) {
      try {
        await handleChat(token, chat);
      } catch (e) {
        console.error("chat error:", e.message);
      }
    }
  } catch (e) {
    console.error("tick error:", e.message);
  }
}

console.log(`lea fanvue worker up, polling every ${POLL_MS}ms via ${BASE}`);
await tick();
setInterval(tick, POLL_MS);

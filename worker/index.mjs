// Lea photo worker.
// The webhook answers text instantly and queues any photo Lea wants to send into
// fanvue_photo_jobs. This always-on worker (no serverless time limit) picks up a
// job, generates the image via fal, uploads it to Fanvue, and sends it — the slow
// ~40s generation would otherwise time out inside the Vercel webhook.

import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL;
const FAL_KEY = process.env.FAL_KEY;
const BASE = process.env.LEABERLIN_BASE || "https://leaberlin.com";
const SECRET = process.env.LEA_SERVICE_SECRET;
const REF = `${BASE}/ref/lea-sheet.jpg`;
const FV = "https://api.fanvue.com";
const V = "2025-06-26";
const POLL_MS = Number(process.env.POLL_MS || 4000);

for (const [k, v] of Object.entries({ DATABASE_URL: DB, FAL_KEY, LEA_SERVICE_SECRET: SECRET })) {
  if (!v) {
    console.error(`${k} missing`);
    process.exit(1);
  }
}
const sql = neon(DB);

async function generate(prompt) {
  const full =
    `Image 1 is the character reference sheet of a woman. Create a photorealistic photo of the exact same woman. ` +
    `Preserve her exact face, freckles, green-hazel eyes, blonde messy hair, gold hoop earrings, thin gold necklace and body proportions from Image 1. ` +
    `Scene: ${prompt}. She stays fully clothed, everyday casual content. Shot on a phone, candid amateur photo aesthetic, realistic skin texture, photorealistic.`;
  const res = await fetch("https://fal.run/fal-ai/hunyuan-image/v3/instruct/edit", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: full,
      image_urls: [REF],
      image_size: { width: 768, height: 1024 },
      num_images: 1,
      output_format: "jpeg",
      enable_safety_checker: false,
      enable_prompt_expansion: false,
    }),
  });
  if (!res.ok) throw new Error(`fal ${res.status} ${(await res.text()).slice(0, 120)}`);
  const url = (await res.json())?.images?.[0]?.url;
  if (!url) throw new Error("fal: no image");
  return url;
}

async function fanvueToken() {
  const res = await fetch(`${BASE}/api/fanvue/token`, { headers: { "x-lea-service": SECRET } });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

async function upload(token, imageUrl) {
  const img = await fetch(imageUrl);
  const bytes = Buffer.from(await img.arrayBuffer());
  const H = { Authorization: `Bearer ${token}`, "X-Fanvue-API-Version": V, "Content-Type": "application/json" };

  const cr = await fetch(`${FV}/media/uploads`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "lea.jpg", filename: "lea.jpg", mediaType: "image", sizeBytes: bytes.length }),
  });
  if (!cr.ok) throw new Error(`create ${cr.status}`);
  const { mediaUuid, uploadId, partSize, totalParts } = await cr.json();
  const parts = totalParts ?? Math.max(1, Math.ceil(bytes.length / partSize));

  const completed = [];
  for (let n = 1; n <= parts; n++) {
    const ur = await fetch(`${FV}/media/uploads/${uploadId}/parts/${n}/url`, { headers: H });
    if (!ur.ok) throw new Error(`part-url ${ur.status}`);
    const signed = (await ur.text()).trim().replace(/^"|"$/g, "");
    const slice = bytes.subarray((n - 1) * partSize, Math.min(n * partSize, bytes.length));
    const put = await fetch(signed, { method: "PUT", body: slice });
    if (!put.ok) throw new Error(`put ${put.status}`);
    completed.push({ PartNumber: n, ETag: put.headers.get("etag") });
  }

  const pt = await fetch(`${FV}/media/uploads/${uploadId}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ parts: completed }),
  });
  if (!pt.ok) throw new Error(`complete ${pt.status}`);
  return mediaUuid;
}

async function sendPhoto(token, fanUuid, mediaUuid) {
  const res = await fetch(`${FV}/chats/${fanUuid}/message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "X-Fanvue-API-Version": V, "Content-Type": "application/json" },
    body: JSON.stringify({ mediaUuids: [mediaUuid] }),
  });
  if (!res.ok) throw new Error(`send ${res.status} ${(await res.text()).slice(0, 120)}`);
}

async function tick() {
  // Atomically claim one job.
  const rows = await sql`
    delete from fanvue_photo_jobs
    where id = (select id from fanvue_photo_jobs order by created_at asc limit 1)
    returning fan_uuid, prompt`;
  if (!rows.length) return;
  const { fan_uuid, prompt } = rows[0];
  try {
    const imageUrl = await generate(prompt);
    const token = await fanvueToken();
    const mediaUuid = await upload(token, imageUrl);
    await sendPhoto(token, fan_uuid, mediaUuid);
    console.log(`sent photo to ${fan_uuid.slice(0, 8)}`);
  } catch (e) {
    console.error("photo job failed:", e.message);
  }
}

console.log(`lea photo worker up, polling jobs every ${POLL_MS}ms`);
setInterval(() => {
  tick().catch((e) => console.error("tick error:", e.message));
}, POLL_MS);

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

// Never let a stray rejection take the whole worker down — it must stay up and
// keep draining the queue.
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e?.message || e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e?.message || e));

// Per-fan photo guard. Duplicate/stale webhook endpoints can enqueue the same
// photo twice, but every path drains THIS one worker — so we dedupe here, the
// shared chokepoint. A fan gets at most one photo per PHOTO_WINDOW_S seconds.
const PHOTO_WINDOW_S = Number(process.env.PHOTO_WINDOW_S || 60);

async function ensureSchema() {
  await sql`create table if not exists fanvue_photo_log (
    fan_uuid text not null,
    sent_at timestamptz not null default now()
  )`;
  await sql`create index if not exists fanvue_photo_log_fan_ts
    on fanvue_photo_log (fan_uuid, sent_at desc)`;
}

// Atomically reserve a photo slot for this fan. Returns true only if no photo
// was reserved for the fan within the window — the reservation row is the lock.
async function reservePhoto(fanUuid) {
  const rows = await sql`
    insert into fanvue_photo_log (fan_uuid)
    select ${fanUuid}
    where not exists (
      select 1 from fanvue_photo_log
      where fan_uuid = ${fanUuid}
        and sent_at > now() - make_interval(secs => ${PHOTO_WINDOW_S})
    )
    returning fan_uuid`;
  return rows.length > 0;
}

async function generate(prompt) {
  // Same prompt shape as the manual Hunyuan chat tests that looked good:
  // identity lock first, then the full scene (spicy allowed on Fanvue).
  const scene = (prompt || "casual selfie, soft light").trim();
  const full =
    `Image 1 is the character reference sheet. Create a photorealistic photo of the same woman. ` +
    `Preserve the exact face, freckles, blonde hair, green-hazel eyes and body proportions from Image 1. ` +
    `${scene}. ` +
    `Realistic skin texture, natural lighting, photorealistic, highly detailed.`;
  const res = await fetch("https://fal.run/fal-ai/hunyuan-image/v3/instruct/edit", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: full,
      image_urls: [REF],
      image_size: { width: 1536, height: 2048 },
      num_images: 1,
      output_format: "png",
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
    body: JSON.stringify({ name: "lea.png", filename: "lea.png", mediaType: "image", sizeBytes: bytes.length }),
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
  // Drop the job if this fan already got (or is getting) a photo in the window.
  if (!(await reservePhoto(fan_uuid))) {
    console.log(`skip duplicate photo for ${fan_uuid.slice(0, 8)}`);
    return;
  }
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

try {
  await ensureSchema();
} catch (e) {
  console.error("ensureSchema failed (continuing):", e.message);
}
console.log(`lea photo worker up, polling jobs every ${POLL_MS}ms (photo window ${PHOTO_WINDOW_S}s)`);
setInterval(() => {
  tick().catch((e) => console.error("tick error:", e.message));
}, POLL_MS);

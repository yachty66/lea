#!/usr/bin/env node
import { loadEnv, uploadRef } from "./lib.mjs";
import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const IDENTITY = `Create a completely new candid iPhone photo of this same woman. Keep her identity: same bone structure, freckles, blonde hair with darker roots, green-hazel eyes, slim build, delicate gold necklace. Do NOT copy the studio headshot, studio lighting, or closed-mouth studio smirk.

CRITICAL — eyes: both eyes look straight at the camera, same size, same eyelid height, same gaze. Natural, matching, human eyes. No lazy eye, no droopy lid, no one eye more closed than the other, no crossed eyes, no warped iris.

Photorealistic, shot on iPhone 15, amateur snapshot, realistic skin texture, pores, no beauty filter. Vertical 4:5 for Twitter, chest-up or waist-up. Single photo, not a collage, not a reference sheet.`;

const JOBS = [
  {
    file: "02-mon-bahn.jpg",
    prompt: `${IDENTITY}

Monday morning in Friedrichshain. She is walking to her café shift on a real Berlin side street like Wühlischstraße: Altbau facades, cobblestones, trees, a street sign, bikes. Cool morning light. She looks slightly tired and unimpressed, small natural almost-smile, messy bun, black short-sleeve crop tee. Phone selfie, arm extended. No TV tower, no Brandenburg Gate, no East Side Gallery, no tourist landmarks.`,
  },
  {
    file: "03-tue-pasta.jpg",
    prompt: `${IDENTITY}

Tuesday evening in her Friedrichshain WG kitchen. Altbau kitchen, warm indoor light, a pot of pasta on the stove, one plate, IKEA clutter. She is 23, cooking pasta for four though she is alone. Oversized black tee, hair in a loose messy bun, small tired smirk. Phone selfie held a bit high. Steam, real apartment mess, not a studio kitchen.`,
  },
  {
    file: "04-wed-wg.jpg",
    prompt: `${IDENTITY}

Wednesday night, nothing-day. She sits by an open Altbau kitchen window in an oversized dark hoodie, bored, phone selfie. Berlin Hinterhof faintly outside: bikes, courtyard, evening. Soft indoor lamp light. Hair down and a bit messy. Small closed-mouth almost-smile, both eyes open. Not a leather sofa, not a club, not a studio.`,
  },
  {
    file: "05-thu-ready.jpg",
    prompt: `${IDENTITY}

Thursday night getting ready in her WG. iPhone mirror selfie in a Berlin Altbau bathroom or bedroom mirror. Going-out black top, messy bun, gold necklace. Evening indoor light. She looks like she has not decided whether to leave yet. A typical WG wall in the reflection (poster, laundry). Not a fashion editorial, not a studio, amateur mirror selfie.`,
  },
  {
    file: "06-fri-bar.jpg",
    prompt: `${IDENTITY}

Friday around 1am in a small dark Berlin kneipe, not a club. Wooden table, a glass of red wine, a candle. Warm tungsten light. She sits looking at the camera, black top, slightly tired flirty almost-smile, both eyes open and matching. Phone selfie at the table. Real Berlin bar interior, bottles on shelves behind her. No dancefloor, no neon club, no Simon-Dach terrace crowd.`,
  },
  {
    file: "07-sat-nine.jpg",
    prompt: `${IDENTITY}

Saturday 9am after being in the club until morning. Harsh daylight outside in Friedrichshain, street or bridge, no landmarks. She still has leftover makeup, messy hair, a light jacket over last night's black top. Exhausted half-smile, both eyes open and matching, a bit puffy. Phone selfie, arm extended. Amateur, a little wrecked, photorealistic. Not inside a club.`,
  },
];

loadEnv();
const ref = await uploadRef("generations/2026-08-29-x-week/lea-face-ref.jpg");
const outDir = "generations/2026-08-29-x-week";
mkdirSync(outDir, { recursive: true });

async function one(job) {
  const started = Date.now();
  console.log("start", job.file);
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: job.prompt,
      image_urls: [ref],
      image_size: { width: 1080, height: 1350 },
      quality: "high",
      num_images: 1,
      output_format: "jpeg",
    },
    logs: false,
  });
  const url = result.data?.images?.[0]?.url;
  if (!url) throw new Error(`${job.file}: no image ${JSON.stringify(result.data)?.slice(0, 200)}`);
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = join(outDir, job.file);
  writeFileSync(file, buf);
  console.log("ok", job.file, `${(buf.length / 1024).toFixed(0)}kb`, `${((Date.now() - started) / 1000).toFixed(0)}s`);
  return file;
}

const results = await Promise.allSettled(JOBS.map(one));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.status === "rejected") {
    console.error("FAIL", JOBS[i].file, r.reason?.message || r.reason);
  }
}
const failed = results.filter((r) => r.status === "rejected").length;
process.exit(failed ? 1 : 0);

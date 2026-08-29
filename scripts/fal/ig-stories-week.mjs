#!/usr/bin/env node
import { loadEnv, uploadRef } from "./lib.mjs";
import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = `Create a completely new candid iPhone vertical story photo of this same woman. Keep her identity: same bone structure, freckles, blonde hair with darker roots, green-hazel eyes, slim build, delicate gold necklace. Do not copy the studio headshot.

Both eyes look at the camera, same size, same gaze, natural.

This is a messy Instagram story, not a posed feed post: slightly off-center, more environment than portrait, harsh real phone camera, photorealistic skin. 9:16 vertical. Single photo.`;

const JOBS = [
  {
    file: "s-sun-lake.jpg",
    prompt: `${BASE}
Sunday at a Berlin lake. She sits on the concrete edge, lots of water and sky in the frame, a brown beer bottle near her hip. Slightly sun-pink, messy bun, black tee. Phone held a bit low so the canal fills the top. Late August afternoon.`,
  },
  {
    file: "s-mon-coffee.jpg",
    prompt: `${BASE}
Monday morning. Close enough to see a paper takeaway coffee cup in her hand. Friedrichshain sidewalk, Altbau, she looks tired and unimpressed. Black crop tee, messy bun. Cool morning light. Not a tourist landmark.`,
  },
  {
    file: "s-tue-pot.jpg",
    prompt: `${BASE}
Tuesday night WG kitchen. The steaming pasta pot is in the foreground, she is in the upper part of the frame taking a selfie. One empty plate, IKEA clutter, warm indoor light, oversized black tee. Amateur, a bit messy.`,
  },
  {
    file: "s-wed-window.jpg",
    prompt: `${BASE}
Wednesday night, nothing happening. She sits at an open Altbau kitchen window in a dark oversized hoodie, Berlin Hinterhof with bikes outside, evening. Bored almost-smile. Soft lamp light. Hair down.`,
  },
  {
    file: "s-thu-door.jpg",
    prompt: `${BASE}
Thursday evening, about to go out. Berlin Altbau hallway by the front door, coats on hooks, black going-out top, messy bun. Warm indoor light. She looks like she has not decided yet.`,
  },
  {
    file: "s-fri-wine.jpg",
    prompt: `${BASE}
Friday 1am in a small dark Berlin kneipe. A glass of red wine and a candle in the foreground, wooden table, bottles on shelves behind. She is at the table, black top, tired flirty almost-smile. Warm tungsten light. Not a club.`,
  },
  {
    file: "s-sat-nine.jpg",
    prompt: `${BASE}
Saturday 9am after a long night. Harsh daylight, light leather jacket over a black top, leftover makeup, messy hair, a bit wrecked. Friedrichshain street, no landmarks. Phone selfie, amateur.`,
  },
];

loadEnv();
const ref = await uploadRef("generations/2026-08-29-x-week/lea-face-ref.jpg");
const outDir = "generations/2026-08-29-x-week/stories";
mkdirSync(outDir, { recursive: true });

async function one(job) {
  const started = Date.now();
  console.log("start", job.file);
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: job.prompt,
      image_urls: [ref],
      image_size: { width: 1080, height: 1920 },
      quality: "high",
      num_images: 1,
      output_format: "jpeg",
    },
    logs: false,
  });
  const url = result.data?.images?.[0]?.url;
  if (!url) throw new Error(`${job.file}: no image`);
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = join(outDir, job.file);
  writeFileSync(file, buf);
  console.log("ok", job.file, `${(buf.length / 1024).toFixed(0)}kb`, `${((Date.now() - started) / 1000).toFixed(0)}s`);
  return file;
}

const results = await Promise.allSettled(JOBS.map(one));
let failed = 0;
for (let i = 0; i < results.length; i++) {
  if (results[i].status === "rejected") {
    failed++;
    console.error("FAIL", JOBS[i].file, results[i].reason?.message || results[i].reason);
  }
}
process.exit(failed ? 1 : 0);

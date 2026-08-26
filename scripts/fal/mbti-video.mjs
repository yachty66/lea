#!/usr/bin/env node
// Turn content/<scene>/frame.png + its Seedance prompt into content/<scene>/video.mp4
//
//   node scripts/fal/mbti-video.mjs car-lost [gym ...]   # selected scenes
//   node scripts/fal/mbti-video.mjs                      # all scenes
//   flags: --duration 8  --resolution 1080p

import { fal } from "@fal-ai/client";
import { loadEnv, uploadRef } from "./lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const config = JSON.parse(readFileSync(join(CONTENT, "scenes.json"), "utf8"));

const args = process.argv.slice(2);
const get = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const duration = get("--duration", "8");
const resolution = get("--resolution", "1080p");
const picked = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const scenes = picked.length ? config.scenes.filter((s) => picked.includes(s.name)) : config.scenes;

loadEnv();

for (const s of scenes) {
  const dir = join(CONTENT, s.name);
  const md = readFileSync(join(dir, "prompt.md"), "utf8");
  const prompt = md.split("```")[1]?.trim();
  if (!prompt || !existsSync(join(dir, "frame.png"))) { console.log(`${s.name}: missing prompt or frame, skipping`); continue; }
  process.stdout.write(`${s.name} ... `);
  const started = Date.now();
  try {
    const image_url = await uploadRef(join(dir, "frame.png"));
    const r = await fal.subscribe("bytedance/seedance-2.0/image-to-video", {
      input: { prompt, image_url, duration, resolution, aspect_ratio: "9:16", generate_audio: true, bitrate_mode: "high" },
      logs: false,
    });
    const url = r.data?.video?.url;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const out = get("--out", "video.mp4"); writeFileSync(join(dir, out), buf);
    writeFileSync(join(dir, out.replace(".mp4", ".json")), JSON.stringify({ prompt, duration, resolution, url, requestId: r.requestId, seconds: (Date.now() - started) / 1000 }, null, 2));
    console.log(`ok (${((Date.now() - started) / 1000).toFixed(0)}s, ${(buf.length / 1e6).toFixed(1)} MB) -> content/${s.name}/${out}`);
  } catch (e) {
    console.log(`FAILED: ${String(e?.body?.detail ?? e?.message ?? e).slice(0, 300)}`);
  }
}

#!/usr/bin/env node
// Produce an episode from a Drehbuch markdown file (## Clip N (image: ...) + Video prompt: blocks).
//
//   node scripts/fal/episode.mjs content/episodes/item-7/ep1-date-night.md --frames
//   node scripts/fal/episode.mjs content/episodes/item-7/ep1-date-night.md --videos
//   node scripts/fal/episode.mjs content/episodes/item-7/ep1-date-night.md --stitch
//
// Output: <episode-dir>/<ep-name>/frame-N.png, clip-N.mp4, episode.mp4

import { fal } from "@fal-ai/client";
import { loadEnv, uploadRef, saveImages } from "./lib.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execSync } from "node:child_process";

const ROOT = new URL("../..", import.meta.url).pathname;
const mdPath = process.argv[2];
const mode = process.argv[3] ?? "--frames";
const md = readFileSync(join(ROOT, mdPath), "utf8");
const epDir = join(ROOT, dirname(mdPath), basename(mdPath, ".md").split("-")[0]); // ep1-date-night.md -> ep1
mkdirSync(epDir, { recursive: true });

const STYLE = " use exactly the art style of the third image: muted colors, everything low poly faceted, no outlines, close up. no other people in the background";
const REFS = ["content/_types/enfj.png", "content/_types/entj.png", "content/car-lost/frame.png"];

const clips = [...md.matchAll(/## Clip (\d+) \(image: ([\s\S]*?)\)\s*\nVideo prompt:\n([\s\S]*?)(?=\n## |$)/g)]
  .map((m) => ({ n: Number(m[1]), image: m[2].replace(/\s+/g, " ").trim(), video: m[3].trim() }));
if (!clips.length) { console.error("no clips parsed"); process.exit(1); }
console.log(`${basename(mdPath)}: ${clips.length} clips -> ${epDir}`);

loadEnv();

const only = process.argv[4] ? process.argv[4].split(",").map(Number) : null;

if (mode === "--frames") {
  const baseUrls = await Promise.all(REFS.map(uploadRef));
  for (const c of clips) {
    if (only && !only.includes(c.n)) continue;
    process.stdout.write(`frame-${c.n} ... `);
    try {
      const anchor = join(epDir, "frame-1.png");
      const useAnchor = c.n > 1 && existsSync(anchor);
      const image_urls = useAnchor ? [await uploadRef(anchor)] : baseUrls;
      const prompt = useAnchor
        ? "keep the same two characters, the same setting and the same art style as the reference image. change the scene to: " + c.image + ". no title text"
        : "can you put the first two characters into this scene: " + c.image + "." + STYLE + ". vertical 9:16 composition";
      const r = await fal.subscribe("openai/gpt-image-2.5/flare/edit", {
        input: { prompt, image_urls, image_size: { width: 1080, height: 1920 }, quality: "high", num_images: 1, output_format: "png" },
      });
      const saved = await saveImages(r.data.images, epDir, `frame-${c.n}`);
      console.log(`ok -> ${saved[0]}`);
    } catch (e) { console.log(`FAILED: ${String(e?.body?.detail ?? e?.message ?? e).slice(0, 200)}`); }
  }
}

if (mode === "--videos") {
  for (const c of clips) {
    const frame = join(epDir, `frame-${c.n}.png`);
    if (!existsSync(frame)) { console.log(`clip-${c.n}: no frame, skipping`); continue; }
    process.stdout.write(`clip-${c.n} ... `);
    const t0 = Date.now();
    try {
      const image_url = await uploadRef(frame);
      const r = await fal.subscribe("minimax/h3-max-turbo/image-to-video", {
        input: { prompt: c.video, image_url, duration: 15, resolution: "1080P" },
      });
      const buf = Buffer.from(await (await fetch(r.data.video.url)).arrayBuffer());
      writeFileSync(join(epDir, `clip-${c.n}.mp4`), buf);
      writeFileSync(join(epDir, `clip-${c.n}.json`), JSON.stringify({ prompt: c.video, url: r.data.video.url, requestId: r.requestId, seconds: (Date.now() - t0) / 1000 }, null, 2));
      console.log(`ok (${((Date.now() - t0) / 1000).toFixed(0)}s, ${(buf.length / 1e6).toFixed(1)} MB)`);
    } catch (e) { console.log(`FAILED: ${String(e?.body?.detail ?? e?.message ?? e).slice(0, 200)}`); }
  }
}

if (mode === "--stitch") {
  const list = clips.map((c) => `file 'clip-${c.n}.mp4'`).join("\n");
  writeFileSync(join(epDir, "concat.txt"), list);
  execSync(`ffmpeg -v error -y -f concat -safe 0 -i concat.txt -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k episode.mp4`, { cwd: epDir, stdio: "inherit" });
  console.log(`stitched -> ${join(epDir, "episode.mp4")}`);
}

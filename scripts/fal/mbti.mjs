#!/usr/bin/env node
// Generate first-frame images for shortmbtistories scenes with nano-banana-2/edit.
//
//   node scripts/fal/mbti.mjs                    # all scenes in content/scenes.json
//   node scripts/fal/mbti.mjs job-interview gym  # selected scenes
//   node scripts/fal/mbti.mjs --n 2              # variants per scene
//
// Output: content/<scene>/frame.png (frame-2.png ...), content/<scene>/prompt.md, content/<scene>/meta.json

import { fal } from "@fal-ai/client";
import { loadEnv, uploadRef, saveImages } from "./lib.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const config = JSON.parse(readFileSync(join(CONTENT, "scenes.json"), "utf8"));

const args = process.argv.slice(2);
const n = args.includes("--n") ? Number(args[args.indexOf("--n") + 1]) : 1;
const picked = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--n");
const scenes = picked.length ? config.scenes.filter((s) => picked.includes(s.name)) : config.scenes;
if (!scenes.length) {
  console.error(`no matching scenes. available: ${config.scenes.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

loadEnv();

const seedancePrompt = (s) => `Low-poly papercraft animation, static camera, keep both characters exactly as in the image. Lively, energetic, comedic dialogue with big gestures and exaggerated facial expressions.

The ${s.first.label} speaks first, in a ${s.first.voice} voice, with big expressive gestures, while the other's mouth stays closed and they react: "${s.first.line}"

Then the ${s.second.label} replies, in a ${s.second.voice} voice, with big expressive gestures, while the other's mouth stays closed and they react: "${s.second.line}"

Only the speaking character moves their lips. ${s.ambience}, no music, no subtitles.`;

for (const s of scenes) {
  const outDir = join(CONTENT, s.name);
  const imagePrompt = config.imagePrefix.replace("[SCENE]", s.scene) + " " + config.imageSuffix;
  const refs = s.types.map((t) => join(CONTENT, "_types", `${t}.png`));
  process.stdout.write(`${s.name} (${s.types.join(" + ")}) ... `);
  try {
    const image_urls = await Promise.all(refs.map(uploadRef));
    const started = Date.now();
    const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: { prompt: imagePrompt, image_urls, aspect_ratio: "9:16", resolution: "2K", num_images: n, output_format: "png" },
      logs: false,
    });
    const images = result.data?.images ?? [];
    const saved = await saveImages(images, outDir, "frame");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "prompt.md"), `# ${s.name}\n\n**Types:** ${s.types.map((t) => t.toUpperCase()).join(" + ")}\n\n## Image prompt (nano-banana-2/edit)\n\n${imagePrompt}\n\n## Seedance 2.0 prompt\n\n\`\`\`\n${seedancePrompt(s)}\n\`\`\`\n`);
    writeFileSync(join(outDir, "meta.json"), JSON.stringify({ ...s, imagePrompt, files: saved, seconds: (Date.now() - started) / 1000 }, null, 2));
    console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s) -> ${saved.join(", ")}`);
  } catch (error) {
    const message = String(error?.body?.detail ?? error?.message ?? error).slice(0, 300);
    console.log(`FAILED: ${message}`);
  }
}

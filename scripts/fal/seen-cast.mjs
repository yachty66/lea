#!/usr/bin/env node
// Generate a single SEEN cast still via openai/gpt-image-2.5/flare/edit (xhigh).
//
//   node scripts/fal/seen-cast.mjs marcus
//   node scripts/fal/seen-cast.mjs elias
//   node scripts/fal/seen-cast.mjs julian

import { fal } from "@fal-ai/client";
import { loadEnv, uploadRef, saveImages } from "./lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const who = process.argv[2];
const STYLE =
  "use exactly the art style of the last image: muted colors, everything low poly faceted, no outlines. vertical 9:16 full-body character portrait, dark studio, single spotlight, standing, three-quarter view, one man only, no text, no extra people";

const CAST = {
  marcus: {
    refs: ["content/_types/intj.png", "content/car-lost/frame.png"],
    prompt:
      "keep the first character's face, hair, mustache and proportions exactly: the same man, swept-back purple hair, purple mustache, angular low-poly face. " +
      STYLE +
      ". dress him as a young founder: long purple coat, black turtleneck, dark trousers, black belt, purple shoes, a watch on his left wrist. expression flat, calculating, chin slightly down, one hand adjusting the watch. no earring.",
  },
  elias: {
    refs: ["content/_types/enfj.png", "content/car-lost/frame.png"],
    prompt:
      "keep the first character's face, hair and proportions exactly: the same man, black curtain hair falling both sides of his face. " +
      STYLE +
      ". dress him in a green suit, white shirt, green tie. expression warm, open, slightly earnest.",
  },
  julian: {
    refs: ["content/_types/entp.png", "content/car-lost/frame.png"],
    prompt:
      "keep the first character's face, hair and proportions exactly: the same man, short purple hair. " +
      STYLE +
      ". dress him in a purple shirt, dark trousers, loosened tie, jacket open. expression easy grin, one eyebrow up, hands in pockets.",
  },
};

if (!CAST[who]) {
  console.error("usage: node scripts/fal/seen-cast.mjs marcus|elias|julian");
  process.exit(1);
}

loadEnv();
const spec = CAST[who];
const outDir = join(ROOT, "content/episodes/seen/cast");
mkdirSync(outDir, { recursive: true });

process.stdout.write(`${who} (gpt-image-2.5/flare xhigh) ... `);
const t0 = Date.now();
const urls = await Promise.all(spec.refs.map(uploadRef));
const r = await fal.subscribe("openai/gpt-image-2.5/flare/edit", {
  input: {
    prompt: spec.prompt,
    image_urls: urls,
    image_size: { width: 1080, height: 1920 },
    quality: "xhigh",
    num_images: 1,
    output_format: "png",
  },
});
const saved = await saveImages(r.data.images, outDir, who);
writeFileSync(
  join(outDir, `${who}.json`),
  JSON.stringify(
    {
      who,
      prompt: spec.prompt,
      refs: spec.refs,
      url: r.data.images[0]?.url,
      requestId: r.requestId,
      seconds: (Date.now() - t0) / 1000,
      quality: "xhigh",
      model: "openai/gpt-image-2.5/flare/edit",
    },
    null,
    2,
  ),
);
console.log(`ok (${((Date.now() - t0) / 1000).toFixed(0)}s) -> ${saved[0]}`);

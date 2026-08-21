#!/usr/bin/env node
// Single generation of Lea from the reference sheet.
//
//   node scripts/fal/generate.mjs --prompt "same woman, drinking a mate at a späti, golden hour" \
//     [--model seedream|gpt] [--n 2] [--name spaeti] [--ref path ...]
//
// Output lands in generations/<yyyy-mm-dd>/.

import { loadEnv, generate, saveImages } from "./lib.mjs";
import { join } from "node:path";

const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const refs = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--ref") refs.push(args[i + 1]);

const prompt = get("--prompt");
if (!prompt) {
  console.error('usage: node scripts/fal/generate.mjs --prompt "..." [--model seedream|gpt] [--n 1] [--name out] [--ref path]');
  process.exit(1);
}

loadEnv();
const model = get("--model", "seedream");
const n = parseInt(get("--n", "1"), 10);
const name = get("--name", `gen-${Date.now()}`);
if (refs.length === 0) refs.push("reference/lea-ref-upscaled.png");

const outDir = join("generations", new Date().toISOString().slice(0, 10));
console.log(`[${model}] ${prompt.slice(0, 80)}...`);
const { images, seconds } = await generate({ model, prompt, refs, n });
const saved = await saveImages(images, outDir, name);
console.log(`done in ${seconds.toFixed(1)}s:`);
for (const file of saved) console.log(`  ${file}`);

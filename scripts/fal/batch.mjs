#!/usr/bin/env node
// Run all (or selected) scenes from scenes.json.
//
//   node scripts/fal/batch.mjs                  # all scenes
//   node scripts/fal/batch.mjs techno-night see-sonntag
//   node scripts/fal/batch.mjs --model gpt      # override model for the run
//
// Output: generations/<yyyy-mm-dd>-batch/<scene>.jpg + summary.json

import { loadEnv, generate, saveImages, writeSummary } from "./lib.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync(new URL("./scenes.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const modelOverride = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;
const picked = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");

const scenes = picked.length
  ? config.scenes.filter((s) => picked.includes(s.name))
  : config.scenes;

if (!scenes.length) {
  console.error(`no matching scenes. available: ${config.scenes.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

loadEnv();
const outDir = join("generations", `${new Date().toISOString().slice(0, 10)}-batch`);
const summary = [];

for (const scene of scenes) {
  const model = modelOverride ?? scene.model ?? config.defaults.model;
  const refs = scene.refs ?? config.defaults.refs;
  const n = scene.n ?? config.defaults.n;
  const prompt = (config.defaults.prefix ?? "") + scene.prompt;
  process.stdout.write(`[${model}] ${scene.name} ... `);
  try {
    const { images, seconds } = await generate({ model, prompt, refs, n });
    const saved = await saveImages(images, outDir, scene.name);
    console.log(`ok (${seconds.toFixed(1)}s) -> ${saved.join(", ")}`);
    summary.push({ name: scene.name, model, ok: true, seconds, files: saved, prompt });
  } catch (error) {
    const message = String(error?.body?.detail ?? error?.message ?? error).slice(0, 200);
    console.log(`FAILED: ${message}`);
    summary.push({ name: scene.name, model, ok: false, error: message, prompt });
  }
}

writeSummary(outDir, summary);
console.log(`\n${summary.filter((s) => s.ok).length}/${summary.length} succeeded. summary: ${join(outDir, "summary.json")}`);

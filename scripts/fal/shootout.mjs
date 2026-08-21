#!/usr/bin/env node
// Run one prompt across several models in parallel and save one image per model.
//
//   node scripts/fal/shootout.mjs --prompt "..." [--ref path] [--models mai,reve,qwen3,seedream5]
//
// Output: generations/<yyyy-mm-dd>-shootout/<model>.png + summary.json

import { fal } from "@fal-ai/client";
import { loadEnv, uploadRef, saveImages, writeSummary } from "./lib.mjs";
import { join } from "node:path";

const SHOOTOUT_MODELS = {
  mai: {
    endpoint: "microsoft/mai-image-2.5-pro/edit",
    input: (prompt, urls) => ({
      prompt,
      image_url: urls[0],
      aspect_ratio: "3:4",
      num_images: 1,
      output_format: "png",
    }),
  },
  reve: {
    endpoint: "reve/2.1/remix",
    input: (prompt, urls) => ({
      prompt,
      image_urls: urls,
      aspect_ratio: "3:4",
      num_images: 1,
      output_format: "png",
    }),
  },
  qwen3: {
    endpoint: "alibaba/qwen-image-3/edit",
    input: (prompt, urls) => ({
      prompt,
      image_urls: urls,
      image_size: { width: 1536, height: 2048 },
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
      enable_prompt_expansion: false,
    }),
  },
  grokq: {
    endpoint: "xai/grok-imagine-image/quality/edit",
    input: (prompt, urls) => ({
      prompt,
      image_urls: urls,
      aspect_ratio: "3:4",
      resolution: "2k",
      num_images: 1,
      output_format: "png",
    }),
  },
  hunyuan3: {
    endpoint: "fal-ai/hunyuan-image/v3/instruct/edit",
    input: (prompt, urls) => ({
      prompt,
      image_urls: urls,
      image_size: { width: 1536, height: 2048 },
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
      enable_prompt_expansion: false,
    }),
  },
  seedream5: {
    endpoint: "bytedance/seedream/v5/pro/edit",
    input: (prompt, urls) => ({
      prompt,
      image_urls: urls,
      image_size: { width: 1536, height: 2048 },
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
    }),
  },
};

const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const prompt = get("--prompt");
if (!prompt) {
  console.error('usage: node scripts/fal/shootout.mjs --prompt "..." [--ref path] [--models mai,reve,qwen3,seedream5]');
  process.exit(1);
}
const ref = get("--ref", "reference/lea-ref-upscaled.png");
const picked = get("--models", Object.keys(SHOOTOUT_MODELS).join(",")).split(",");

loadEnv();
const urls = [await uploadRef(ref)];
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
const outDir = join("generations", `shootout-${stamp}`);

console.log(`running ${picked.join(", ")} in parallel...`);
const results = await Promise.allSettled(
  picked.map(async (key) => {
    const model = SHOOTOUT_MODELS[key];
    if (!model) throw new Error(`unknown model "${key}"`);
    const started = Date.now();
    const result = await fal.subscribe(model.endpoint, { input: model.input(prompt, urls) });
    const seconds = (Date.now() - started) / 1000;
    const saved = await saveImages(result.data?.images ?? [], outDir, key);
    return { key, endpoint: model.endpoint, seconds, files: saved };
  })
);

const summary = [];
results.forEach((res, i) => {
  const key = picked[i];
  if (res.status === "fulfilled") {
    console.log(`${key}: ok (${res.value.seconds.toFixed(1)}s) -> ${res.value.files.join(", ")}`);
    summary.push({ ...res.value, ok: true, prompt });
  } else {
    const detail = res.reason?.body?.detail ?? res.reason?.message ?? res.reason;
    const message = (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300);
    console.log(`${key}: FAILED: ${message}`);
    summary.push({ key, ok: false, error: message, prompt });
  }
});
writeSummary(outDir, summary);

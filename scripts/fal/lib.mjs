import { fal } from "@fal-ai/client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

export function loadEnv() {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  const match = env.match(/^FAL_KEY=(.+)$/m);
  if (!match) throw new Error("FAL_KEY missing in .env.local");
  fal.config({ credentials: match[1].trim().replace(/^"|"$/g, "") });
}

export const MODELS = {
  seedream: {
    endpoint: "fal-ai/bytedance/seedream/v4/edit",
    input: (prompt, imageUrls, n) => ({
      prompt,
      image_urls: imageUrls,
      image_size: { width: 1080, height: 1440 },
      num_images: n,
      enable_safety_checker: false,
    }),
  },
  gpt: {
    endpoint: "openai/gpt-image-2/edit",
    input: (prompt, imageUrls, n) => ({
      prompt,
      image_urls: imageUrls,
      image_size: "auto",
      quality: "high",
      num_images: n,
      output_format: "jpeg",
    }),
  },
};

const uploadCache = new Map();

export async function uploadRef(path) {
  const abs = path.startsWith("/") ? path : join(ROOT, path);
  if (uploadCache.has(abs)) return uploadCache.get(abs);
  const buffer = readFileSync(abs);
  const type = abs.endsWith(".png") ? "image/png" : "image/jpeg";
  const url = await fal.storage.upload(new File([buffer], basename(abs), { type }));
  uploadCache.set(abs, url);
  return url;
}

export async function generate({ model = "seedream", prompt, refs, n = 1 }) {
  const preset = MODELS[model];
  if (!preset) throw new Error(`unknown model "${model}" (use: ${Object.keys(MODELS).join(", ")})`);
  const imageUrls = await Promise.all(refs.map(uploadRef));
  const started = Date.now();
  const result = await fal.subscribe(preset.endpoint, {
    input: preset.input(prompt, imageUrls, n),
    logs: false,
  });
  const images = result.data?.images ?? [];
  return { images, seconds: (Date.now() - started) / 1000 };
}

export async function saveImages(images, outDir, name) {
  mkdirSync(outDir, { recursive: true });
  const saved = [];
  for (let i = 0; i < images.length; i++) {
    const res = await fetch(images[i].url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = images[i].content_type?.includes("png") ? "png" : "jpg";
    const file = join(outDir, `${name}${images.length > 1 ? `-${i + 1}` : ""}.${ext}`);
    writeFileSync(file, buffer);
    saved.push(file);
  }
  return saved;
}

export function writeSummary(outDir, entries) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(entries, null, 2));
}

const PHOTOS = ["fit", "street", "alex", "bar"] as const;

export function fallbackPhoto(): string {
  return `/images/${PHOTOS[Math.floor(Math.random() * PHOTOS.length)]}.jpg`;
}

/** Shared Hunyuan edit settings — matched to the live chat tests that looked good. */
export const PHOTO_IMAGE_SIZE = { width: 1536, height: 2048 } as const;

export type PhotoGenOptions = {
  /** When true (Fanvue), do not force clothed / everyday-only. */
  allowSpicy?: boolean;
};

/**
 * Build the fal prompt the same way as our successful manual Hunyuan tests:
 * identity lock first, then the scene description as the main instruction.
 */
export function buildPhotoPrompt(description: string, options: PhotoGenOptions = {}): string {
  const scene = description.trim() || "casual selfie in her apartment, soft light";
  const identity =
    `Image 1 is the character reference sheet. Create a photorealistic photo of the same woman. ` +
    `Preserve the exact face, freckles, blonde hair, green-hazel eyes and body proportions from Image 1. `;

  if (options.allowSpicy) {
    return (
      identity +
      `${scene}. ` +
      `Realistic skin texture, natural lighting, photorealistic, highly detailed.`
    );
  }

  return (
    identity +
    `${scene}. ` +
    `She stays fully clothed, everyday casual content. ` +
    `Shot on a phone, candid amateur photo aesthetic, realistic skin texture, photorealistic.`
  );
}

export async function generatePhoto(
  description: string,
  origin: string,
  options: PhotoGenOptions = {}
): Promise<string> {
  const prompt = buildPhotoPrompt(description, options);
  const response = await fetch("https://fal.run/fal-ai/hunyuan-image/v3/instruct/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(110_000),
    body: JSON.stringify({
      prompt,
      image_urls: [new URL("/ref/lea-sheet.jpg", origin).toString()],
      image_size: PHOTO_IMAGE_SIZE,
      num_images: 1,
      output_format: "png",
      enable_safety_checker: false,
      enable_prompt_expansion: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`fal ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const url = data?.images?.[0]?.url;
  if (typeof url !== "string") throw new Error("fal returned no image");
  return url;
}

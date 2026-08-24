const PHOTOS = ["fit", "street", "alex", "bar"] as const;

export function fallbackPhoto(): string {
  return `/images/${PHOTOS[Math.floor(Math.random() * PHOTOS.length)]}.jpg`;
}

export async function generatePhoto(description: string, origin: string): Promise<string> {
  const prompt =
    `Image 1 is the character reference sheet of a woman. Create a photorealistic photo of the exact same woman. ` +
    `Preserve her exact face, freckles, green-hazel eyes, blonde messy hair, gold hoop earrings, thin gold necklace and body proportions from Image 1. ` +
    `Scene: ${description}. ` +
    `She stays fully clothed, everyday casual content. Shot on a phone, candid amateur photo aesthetic, realistic skin texture, photorealistic.`;
  const response = await fetch("https://fal.run/fal-ai/hunyuan-image/v3/instruct/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(75_000),
    body: JSON.stringify({
      prompt,
      image_urls: [new URL("/ref/lea-sheet.jpg", origin).toString()],
      image_size: { width: 768, height: 1024 },
      num_images: 1,
      output_format: "jpeg",
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

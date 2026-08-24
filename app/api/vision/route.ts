import { getSessionUser } from "@/lib/auth/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image : "";
  if (!image.startsWith("data:image/") || image.length > 3_000_000) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const call = async (endpoint: string, input: Record<string, unknown>, key: string) => {
    const response = await fetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`fal ${response.status} ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    const description = typeof data?.[key] === "string" ? data[key].trim() : "";
    if (!description) throw new Error("empty description");
    return description;
  };

  try {
    const description = await call(
      "fal-ai/moondream-next",
      {
        image_url: image,
        prompt:
          "Describe this photo objectively in one or two short sentences: who or what is visible, their appearance and clothing, the setting and mood. Just describe, no commentary.",
      },
      "output"
    );
    return Response.json({ description });
  } catch (first) {
    console.error("moondream failed:", first);
    try {
      const description = await call(
        "fal-ai/florence-2-large/more-detailed-caption",
        { image_url: image },
        "results"
      );
      return Response.json({ description });
    } catch (second) {
      console.error("florence fallback failed:", second);
      return Response.json({ description: "" });
    }
  }
}

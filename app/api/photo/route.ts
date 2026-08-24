import { getSessionUser } from "@/lib/auth/server";
import { generatePhoto, fallbackPhoto } from "@/lib/photo";

export const maxDuration = 90;

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const description =
    typeof body?.description === "string" ? body.description.slice(0, 300).trim() : "";

  const requestOrigin = new URL(request.url).origin;
  const origin = requestOrigin.includes("localhost") ? "https://leaberlin.com" : requestOrigin;

  try {
    const photo = await generatePhoto(
      description || "casual selfie in her apartment, soft light",
      origin
    );
    return Response.json({ photo });
  } catch (error) {
    console.error("photo generation failed:", error);
    return Response.json({ photo: fallbackPhoto() });
  }
}

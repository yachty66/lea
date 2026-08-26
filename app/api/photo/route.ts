import { after } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { saveMessages } from "@/lib/db";
import { generatePhoto, fallbackPhoto } from "@/lib/photo";

export const maxDuration = 90;

export async function POST(request: Request) {
  const isService =
    !!process.env.LEA_SERVICE_SECRET &&
    request.headers.get("x-lea-service") === process.env.LEA_SERVICE_SECRET;
  const user =
    !isService && process.env.NODE_ENV !== "development" ? await getSessionUser() : null;
  if (!isService && process.env.NODE_ENV !== "development" && !user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const description =
    typeof body?.description === "string" ? body.description.slice(0, 300).trim() : "";

  const requestOrigin = new URL(request.url).origin;
  const origin = requestOrigin.includes("localhost") ? "https://leaberlin.com" : requestOrigin;

  const persist = (photo: string) => {
    if (!user) return;
    after(() => saveMessages(user.id, [{ role: "assistant", content: "", photoUrl: photo }]));
  };

  try {
    const photo = await generatePhoto(
      description || "casual selfie in her apartment, soft light",
      origin
    );
    persist(photo);
    return Response.json({ photo });
  } catch (error) {
    console.error("photo generation failed:", error);
    const photo = fallbackPhoto();
    persist(photo);
    return Response.json({ photo });
  }
}

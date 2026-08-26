import { sweepUnread, dbg } from "@/lib/fanvue-chat";

export const maxDuration = 90;

// Service-only fallback sweep (called by the Railway worker as a safety net for
// any webhook Fanvue failed to deliver).
export async function POST(request: Request) {
  if (
    !process.env.LEA_SERVICE_SECRET ||
    request.headers.get("x-lea-service") !== process.env.LEA_SERVICE_SECRET
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const origin = new URL(request.url).origin.includes("localhost")
      ? "https://leaberlin.com"
      : new URL(request.url).origin;
    const handled = await sweepUnread(origin);
    if (handled) await dbg("poll", `handled=${handled}`);
    return Response.json({ handled });
  } catch (error) {
    return Response.json({ error: String(error).slice(0, 200) }, { status: 502 });
  }
}

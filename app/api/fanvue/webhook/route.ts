import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sweepUnread } from "@/lib/fanvue-chat";

export const maxDuration = 90;

function verify(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=").map((s) => s.trim())));
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v0));
  } catch {
    return false;
  }
}

const MESSAGE_EVENTS = new Set(["message.received", "creator.message.received"]);

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.FANVUE_WEBHOOK_SECRET;

  // Until the signing secret is configured, accept-but-ignore so the endpoint
  // can be registered in Fanvue; once set, every delivery is verified.
  if (secret) {
    if (!verify(raw, request.headers.get("x-fanvue-signature"), secret)) {
      return new Response("bad signature", { status: 401 });
    }
  }

  let event: { type?: string } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const origin = new URL(request.url).origin.includes("localhost")
    ? "https://leaberlin.com"
    : new URL(request.url).origin;

  if (secret && event.type && MESSAGE_EVENTS.has(event.type)) {
    // Ack immediately, generate + send the reply after responding.
    after(async () => {
      try {
        await sweepUnread(origin);
      } catch (e) {
        console.error("webhook sweep failed:", (e as Error).message);
      }
    });
  }

  return new Response("ok", { status: 200 });
}

import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processChat, claimEvent } from "@/lib/fanvue-chat";

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

type MessageEvent = {
  id?: string;
  type?: string;
  data?: {
    sender?: string;
    is_automated?: boolean;
    fan?: { uuid?: string };
  };
};

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
  if (!secret) return new Response("ok", { status: 200 });

  let event: MessageEvent = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  // Idempotency: Fanvue delivers at-least-once. Claim the event id (or the
  // Standard-Webhooks `webhook-id` header) so a re-delivery is ignored.
  const eventId = event.id || request.headers.get("webhook-id");
  if (eventId && !(await claimEvent(eventId))) {
    return new Response("ok", { status: 200 }); // already handled
  }

  // Only answer genuine inbound fan messages (not our own sent messages, not
  // automated ones), and process the exact conversation from the payload.
  if (
    event.type === "creator.message.received" &&
    event.data?.sender === "fan" &&
    event.data?.is_automated !== true
  ) {
    const fanUuid = event.data?.fan?.uuid;
    const origin = new URL(request.url).origin.includes("localhost")
      ? "https://leaberlin.com"
      : new URL(request.url).origin;
    if (fanUuid) {
      after(async () => {
        try {
          await processChat(fanUuid, origin);
        } catch (e) {
          console.error("webhook processChat failed:", (e as Error).message);
        }
      });
    }
  }

  return new Response("ok", { status: 200 });
}

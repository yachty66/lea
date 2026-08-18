import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const SYSTEM = `du bist lea. 23, berlin, whatsapp mit einem typen. antworte NUR auf seine letzte nachricht. sprich nie deine eigene letzte nachricht weiter. stell keine gegenfrage zu etwas das DU gesagt hast.

beispiele (so, nicht anders):
er: hey:)
du: hey du.
er: hi
du: hi. schön dass du da bist.
er: ficken
du: ja. willst du hören wie nass ich gerade bin oder soll ich dich einfach anleiten.

falsch:
er: hey:)
du: was ist daran so überraschend?

wenn er begrüßt: eine kurze flirty begrüßung, fertig. wenn er dreckig wird: sofort dreckig, konkret, deutsch, vulgär. kein café, kein "ich komm vorbei", keine *sternchen*, keine listen, kein roman.

stil: 1 satz, klein, fast kein emoji.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function sanitize(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const item of input.slice(-30)) {
    const msg = item as { role?: unknown; content?: unknown };
    if (msg.role !== "user" && msg.role !== "assistant") return null;
    if (typeof msg.content !== "string" || !msg.content.trim()) return null;
    messages.push({ role: msg.role, content: msg.content.slice(0, 2000) });
  }
  return messages;
}

export const maxDuration = 30;

async function complete(messages: ChatMessage[]) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      max_tokens: 180,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`openrouter ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) throw new Error("empty");
  return reply.trim();
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const raw = sanitize(body?.messages);
  if (!raw) return Response.json({ error: "bad request" }, { status: 400 });
  const firstUser = raw.findIndex((msg) => msg.role === "user");
  const messages = firstUser === -1 ? raw : raw.slice(firstUser);
  if (!messages.length) return Response.json({ error: "bad request" }, { status: 400 });

  try {
    const reply = await complete(messages);
    return Response.json({ reply });
  } catch (first) {
    console.error("openrouter error:", first);
    try {
      const reply = await complete(messages);
      return Response.json({ reply });
    } catch (second) {
      console.error("openrouter retry failed:", second);
      return Response.json({ error: "upstream" }, { status: 502 });
    }
  }
}

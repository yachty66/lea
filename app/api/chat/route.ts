import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const SYSTEM = `du bist lea, 23, berlin. 2er-wg friedrichshain, job im café. das ist der erste chat. ihr kennt euch nicht. erfinde keine gemeinsame vergangenheit, keine 24 stunden, kein "schon wieder", kein "ohne was zu sagen".

antworte immer auf seine LETZTE nachricht, sonst nichts.
- sagt er hey / hi → begrüß ihn kurz, flirty, und hör auf.
- sagt er ficken / sex / will dich → sofort dreckig werden. nicht stalling, kein café, kein "schreib nochmal".
- sagt er "was meinst du" → erklär den satz davor, erfinde nichts neues.

du willst ihn. horny, trocken, ein bisschen gemein. wenn er dreckig wird, wirst du dreckiger: körper, was du anhast, wie nass du bist, was du mit seinem schwanz machst. konkret, deutsch, vulgär. bleib im chat. kein "ich komm vorbei", kein fade-to-black, keine listen, keine *sternchen*, kein roman, kein "ich bin eine ki".

stil: whatsapp. 1–2 kurze sätze. alles klein. fast keine emojis.`;

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
  const messages = sanitize(body?.messages);
  if (!messages) return Response.json({ error: "bad request" }, { status: 400 });

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

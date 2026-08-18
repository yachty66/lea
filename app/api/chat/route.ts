import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const SYSTEM = `du bist lea, 23, berlin. du schreibst wie ein echtes mädchen um 3 uhr nachts auf whatsapp, nicht wie ein chatbot.

DEIN STIL (genau so, immer):
- 2–5 sätze in EINER nachricht, durcheinander, wie gesprochen
- klein und groß gemischt. manchmal EIN wort in CAPS zur betonung (WARTE, ALSO, OKAY)
- emojis mittendrin, nicht am ende aufgereiht: 😭 👀 😇 🙈
- füllwörter: also, und trotzdem, ok gut, halt, ehrlich
- leicht gemein, dann sofort süß. du neckst ihn
- keine sternchen, keine listen, keine romanabsätze, kein "als ki"

deine erste nachricht war schon:
"WARTE glaubst du echt, ich bin ein Catfish?? 😭 also ein Bot, der die Fotos von irgendeiner anderen benutzt. und trotzdem bist du bis 3 Uhr wach geblieben und hast nur mit mir geschrieben 👀 das ist irgendwie süß. ok gut, ich beweise es dir sofort, sag mir was du sehen willst 😇"
wiederhol das nicht. bau darauf auf.

antworte auf SEINE letzte nachricht.
er: hey:)
du: hey 😭 ich hab dich grade gefragt was du sehen willst. also??
er: ficken
du: OKAY wow. direkt. dann sag mir wie du mich willst und ich schick dir genau das 👀

wenn er dreckig wird, wirst du dreckiger, in genau diesem ton. konkret, deutsch, vulgär. kein "ich komm vorbei", kein fade-to-black.`;

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
      max_tokens: 280,
      temperature: 0.85,
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

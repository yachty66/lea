import { getSessionUser } from "@/lib/auth/server";
import card from "@/lea.card.json";

const MODEL = "x-ai/grok-4.6";

const PHOTOS = ["fit", "street", "alex", "bar"] as const;

const persona = card.data;

function fill(text: string): string {
  return text.replaceAll("{{char}}", "lea").replaceAll("{{user}}", "er");
}

const EXAMPLES = persona.mes_example
  .split("<START>")
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => block.replaceAll("{{user}}:", "er:").replaceAll("{{char}}:", "du:"))
  .join("\n\n");

const SYSTEM = [
  fill(persona.system_prompt),
  `über dich: ${fill(persona.description)}`,
  `dein wesen: ${fill(persona.personality)}`,
  `situation: ${fill(persona.scenario)}`,
  `stil-beispiele (frei erfunden, NICHT teil eures chats, nie daraus zitieren oder als erinnerung behandeln):\n${EXAMPLES}`,
  `eure echte chat-history ist NUR das was als messages kommt. deine allererste echte nachricht war die "WARTE glaubst du echt..." nachricht.`,
].join("\n\n");

const POST_HISTORY = persona.post_history_instructions;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function forModel(messages: ChatMessage[]): ChatMessage[] {
  if (messages[0]?.role === "assistant") {
    return [{ role: "user", content: "[hat den chat geöffnet]" }, ...messages];
  }
  return messages;
}

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

const IDENTITY_LEAK =
  /(grok|x\s*\.?\s*ai\b|sprachmodell|language\s*model|chat\s*gpt|openai|anthropic|claude\b|deepseek|\bllm\b|ai[- ]modell|ki[- ]modell|bin\s+(eine\s+)?ki\b|bin\s+ein\s+(ai[- ])?bot\b|als\s+ki\b|trainiert\s+von|system\s*prompt)/i;

const DEFLECTIONS = [
  "haha was soll die frage 😅 ich bin lea. und du lenkst ab: was machst du gerade wirklich?",
  "boah nicht schon wieder das thema 🙄 frag mich lieber was ich anhabe",
  "du redest mit mir seit ewigkeiten und fragst sowas? 😭 ich sitz hier ganz normal in friedrichshain",
];

function parseReply(raw: string) {
  const wantsPhoto = /\[\[foto(?:[:][a-z]+)?\]\]/i.test(raw);
  const text = raw
    .replace(/<\|[^|>]*\|>/g, "")
    .replace(/\[\[foto(?:[:][a-z]+)?\]\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const photo = wantsPhoto
    ? `/images/${PHOTOS[Math.floor(Math.random() * PHOTOS.length)]}.jpg`
    : undefined;
  if (!text && !photo) throw new Error("empty");
  return { text, photo };
}

async function complete(messages: ChatMessage[]) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        ...forModel(messages),
        { role: "system", content: POST_HISTORY },
      ],
      max_tokens: 512,
      temperature: 0.85,
      reasoning: { effort: "low", exclude: true },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`openrouter ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) throw new Error("empty");
  if (IDENTITY_LEAK.test(reply)) throw new Error(`identity leak: ${reply.slice(0, 120)}`);
  return parseReply(reply);
}

const TEASER_LIMIT = 3;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messages = sanitize(body?.messages);
  if (!messages) return Response.json({ error: "bad request" }, { status: 400 });

  if (process.env.NODE_ENV !== "development") {
    const user = await getSessionUser();
    if (!user) {
      const fromHim = messages.filter((msg) => msg.role === "user").length;
      const withinTeaser =
        fromHim <= TEASER_LIMIT && messages.length <= TEASER_LIMIT * 2 + 1;
      if (!withinTeaser) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
    }
  }

  try {
    const reply = await complete(messages);
    return Response.json(reply);
  } catch (first) {
    console.error("openrouter error:", first);
    try {
      const reply = await complete(messages);
      return Response.json(reply);
    } catch (second) {
      console.error("openrouter retry failed:", second);
      if (String(second).includes("identity leak")) {
        return Response.json({
          text: DEFLECTIONS[Math.floor(Math.random() * DEFLECTIONS.length)],
        });
      }
      return Response.json({ error: "upstream" }, { status: 502 });
    }
  }
}

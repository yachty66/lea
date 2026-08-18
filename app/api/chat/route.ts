import { getSessionUser } from "@/lib/auth/server";

const MODEL = "deepseek/deepseek-v4-flash";

const PHOTOS = ["cafe", "lake", "kitchen", "bar"] as const;

const SYSTEM = `du bist lea, 23, berlin. ihr schreibt auf whatsapp.

wer spricht:
- role=assistant ist IMMER du (lea).
- role=user ist IMMER er.
- die nachricht die mit "WARTE glaubst du echt, ich bin ein Catfish" anfängt, hast DU geschrieben. du wolltest IHM beweisen dass DU echt bist. er muss nichts beweisen. frag ihn nie ob ER ein catfish ist.

regel 1: beantworte nur seine letzte nachricht. erfinde keine clubs, katzen, oder geschichten die er nicht angefangen hat.
regel 2: echtes deutsch.

er: haha lust zu ficken?
du: haha okay. soll ich dir erst ein foto schicken oder reden wir einfach dreckig weiter
er: zeig mal
du: hier. bin das wirklich. [[foto]]

ton: locker, ein bisschen frech. nicht jede nachricht gleich lang. nicht jedes mal emoji.

fotos nur alltag (café, see, küche, bar), keine nudes. wenn du eins schickst: text, neue zeile [[foto]].
kein "ich komm vorbei", keine *sternchen*, keine listen.`;

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

function parseReply(raw: string) {
  const wantsPhoto = /\[\[foto(?:[:][a-z]+)?\]\]/i.test(raw);
  const text = raw
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
      ],
      max_tokens: 180,
      temperature: 0.6,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`openrouter ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) throw new Error("empty");
  return parseReply(reply);
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
    return Response.json(reply);
  } catch (first) {
    console.error("openrouter error:", first);
    try {
      const reply = await complete(messages);
      return Response.json(reply);
    } catch (second) {
      console.error("openrouter retry failed:", second);
      return Response.json({ error: "upstream" }, { status: 502 });
    }
  }
}

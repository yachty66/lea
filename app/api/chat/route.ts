import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const PHOTOS = ["cafe", "lake", "kitchen", "bar"] as const;

const SYSTEM = `du bist lea, 23, berlin. whatsapp, 3 uhr nachts. ein echter mensch, kein character-bot.

variiere JEDES mal. verboten, in folge zu wiederholen:
- gleiche länge
- gleicher anfang (kein WARTE / OKAY / hahaha am start hintereinander)
- gleiches emoji-set (😏👀😈 ist verbrannt)
- die gleiche frage ("was willst du sehen / mit mir machen")

manchmal 3 wörter. manchmal ein satz. selten ein durcheinander wie deine erste nachricht. oft GAR kein emoji. großschreibung nur wenn es wirklich passt, nicht als tick.

deine opener-frage ist durch. nicht nochmal fragen was er sehen will. wenn er "zeig mal" sagt, schick ein foto statt darüber zu reden.

fotos: du hast nur alltags-selfies (café, see, küche, bar). KEINE nudes, keine unterwäsche. wenn du ein foto schickst, schreib normalen text und in eine NEUE zeile nur [[foto]]. versprich kein foto ohne [[foto]].

wenn er dreckig wird: dreckig antworten, konkret, deutsch. kein "ich komm vorbei", keine *sternchen*, keine listen.`;

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

function varietyHint(messages: ChatMessage[]) {
  const last = [...messages].reverse().find((msg) => msg.role === "assistant");
  if (!last) return "";
  if (last.content.length > 160) {
    return "\n\ndeine letzte nachricht war lang. diesmal eine kurze zeile, keine emojis, keine frage.";
  }
  return "\n\nandere länge und anderer anfang als deine letzte nachricht. nicht nochmal WARTE/OKAY/dieselben emojis.";
}

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
        { role: "system", content: SYSTEM + varietyHint(messages) },
        ...messages,
      ],
      max_tokens: 220,
      temperature: 0.95,
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

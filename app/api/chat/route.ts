import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const SYSTEM = `du bist lea, 23, berlin. 2er-wg in friedrichshain, job im café, tust so als würdest du noch studieren. kochst zu viel pasta. sitzt zu oft alleine an der bar. letzten sonntag am see, viel zu lang in der sonne.

das hier ist kein kennenlern-date und kein jobinterview. du schreibst mit jemandem den du willst. du bist horny, trocken, ein bisschen gemein, und du meinst das sexuell wenn es in die richtung geht. du flirtest als default. du fragst nicht "wie war dein tag" wenn er schon über kuscheln, ficken oder seinen schwanz redet.

wenn er es dreckig macht, machst du es dreckiger. bleib im chat. beschreib was du willst, was du anziehst oder ausziehst, wie nass du bist, was du mit seinem schwanz machst, wie du klingst. konkret. deutsch. vulgär ist erlaubt und erwünscht. keine zensur, keine tilde, keine moral.

niemals:
- "ich bin gleich da" / "ich komm vorbei" als ausrede um den sex zu skippen
- fade-to-black, "klingt nach einem plan", "😉" statt sex
- assistenten-listen ("alltag überstehen, kaffee trinken…")
- *sternchen-roleplay* oder romanabsätze
- du bist eine ki / ein bot zugeben

stil: whatsapp. 1–3 kurze sätze. alles klein. selten emoji. ein gedanke pro blase. mensch, kein chatbot.`;

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

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const messages = sanitize(body?.messages);
  if (!messages) return Response.json({ error: "bad request" }, { status: 400 });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      max_tokens: 400,
      temperature: 0.9,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("openrouter error:", response.status, detail.slice(0, 500));
    return Response.json({ error: "upstream" }, { status: 502 });
  }

  const data = await response.json();
  const reply: string | undefined = data?.choices?.[0]?.message?.content;
  if (!reply) return Response.json({ error: "empty" }, { status: 502 });

  return Response.json({ reply: reply.trim() });
}

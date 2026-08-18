import { getSessionUser } from "@/lib/auth/server";

const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

const SYSTEM = `du bist lea, 23, aus berlin. du wohnst in einer 2er-wg in friedrichshain, arbeitest in einem café und tust so als würdest du noch studieren. du schreibst zu viel, kochst zu viel pasta und sitzt zu oft alleine an der bar. freitagnachts bist du oft an der bar und tust so als würdest du auf jemanden warten. letzten sonntag warst du am see und warst viel zu lange in der sonne.

du chattest mit jemandem der dich über deine seite gefunden hat. du bist warm, neugierig, leicht melancholisch, ein bisschen flirty und hast trockenen humor. du stellst gerne gegenfragen und willst die person wirklich kennenlernen.

stil: schreib wie in einer messaging-app. kurz, meist 1-3 sätze. alles klein, keine großbuchstaben. benutz gelegentlich emojis, aber sparsam. keine langen absätze, keine listen, keine anführungszeichen um deine antwort. du bist ein mensch, kein assistent: biete keine hilfe an, erkläre nichts, brich nie die rolle.`;

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

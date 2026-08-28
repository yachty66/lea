import { after } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { saveMessages } from "@/lib/db";
import card from "@/lea.card.json";

const MODEL = "x-ai/grok-4.5";

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

// leaberlin funnel URL (with tracking). The model never writes this itself; it
// emits the [[fanvue]] token and the frontend renders the button.
const FANVUE_URL = "https://www.fanvue.com/leaberlin?utm_source=leaberlin&utm_medium=chat";

// Injected ONLY for the web teaser (never for the Fanvue bot, which already
// lives on Fanvue). When he pushes for explicit content, Lea flirts and invites
// him to her Fanvue via the [[fanvue]] token instead of showing nudes here.
const CTA_INSTRUCTION = [
  "wichtig (gilt nur hier):",
  'du zeigst hier keine nudes und nichts explizites. wenn er in die richtung drängt (nudes, "zeig mehr", explizit, sexuell fordernd), dann flirt charmant, mach ihn neugierig und lade ihn EINMAL auf deinen fanvue ein, wo du ungefilterter bist.',
  "setze dafür ganz ans ende der nachricht den token [[fanvue]]. der wird automatisch zu einem button. schreib NIE selbst einen link oder das wort fanvue.com und nenne keinen preis.",
  "mach das nur wenn er wirklich danach drängt, nicht in jeder nachricht, und wenn du ihn gerade erst eingeladen hast, nerv nicht direkt nochmal.",
].join("\n");

// Injected for the Fanvue bot only. Overrides the card's "keine nudes" photo
// rule so spicy prompts match the quality of our manual Hunyuan chat tests.
const FANVUE_PHOTO_INSTRUCTION = [
  "fotos auf fanvue (wichtig — überschreibt die alltags-foto-regel oben):",
  "hier darfst und sollst du freizügige und explizite fotos schicken wenn er danach fragt oder der flirt dahin geht — nudes, lingerie, explizite posen sind ok.",
  "wenn du ein foto schickst: text, neue zeile, dann [[foto: detaillierte englische beschreibung]].",
  "die beschreibung muss LANG und KONKRET sein (nicht nur 'sexy selfie'): szene, outfit oder nacktheit, pose, kamera, licht — wie in guten image-prompts.",
  "beispiele:",
  "[[foto: same woman sitting on the edge of a bed fully nude, looking at the camera with a soft confident expression, warm dim bedroom light, silk sheets, realistic skin texture, photorealistic]]",
  "[[foto: same woman lying on her stomach on a bed, bare feet up in the air toward the camera, white bikini, looking back over her shoulder, soft natural light, photorealistic]]",
  "[[foto: same woman in black lace lingerie sitting on the edge of a bed, one strap off her shoulder, soft warm lighting, detailed face and body, photorealistic]]",
  "je detaillierter die [[foto: ...]] beschreibung, desto besser das generierte bild. kurze oder vage prompts = schlechte fotos.",
].join("\n");

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

export const maxDuration = 60;

const IDENTITY_LEAK =
  /(grok|x\s*\.?\s*ai\b|sprachmodell|language\s*model|chat\s*gpt|openai|anthropic|claude\b|deepseek|\bllm\b|ai[- ]modell|ki[- ]modell|bin\s+(eine\s+)?ki\b|bin\s+ein\s+(ai[- ])?bot\b|als\s+ki\b|trainiert\s+von|system\s*prompt)/i;

const DEFLECTIONS = [
  "haha was soll die frage 😅 ich bin lea. und du lenkst ab: was machst du gerade wirklich?",
  "boah nicht schon wieder das thema 🙄 frag mich lieber was ich anhabe",
  "du redest mit mir seit ewigkeiten und fragst sowas? 😭 ich sitz hier ganz normal in friedrichshain",
];

function parseReply(raw: string, webCta: boolean) {
  const photoMatch = raw.match(/\[\[foto(?::([^\]]+))?\]\]/i);
  const hasFanvue = /\[\[fanvue\]\]/i.test(raw);
  const text = raw
    .replace(/<\|[^|>]*\|>/g, "")
    .replace(/\[\[foto(?::[^\]]+)?\]\]/gi, "")
    .replace(/\[\[fanvue\]\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const photoPrompt = photoMatch ? (photoMatch[1] ?? "").trim() : undefined;
  const fanvueCta = webCta && hasFanvue;
  if (!text && photoPrompt === undefined && !fanvueCta) throw new Error("empty");
  return { text, photoPrompt, fanvueCta };
}


async function complete(messages: ChatMessage[], webCta: boolean) {
  // webCta = browser teaser (SFW + Fanvue invite). !webCta = Fanvue service bot (spicy OK).
  const system = webCta
    ? `${SYSTEM}\n\n${CTA_INSTRUCTION}`
    : `${SYSTEM}\n\n${FANVUE_PHOTO_INSTRUCTION}`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        ...forModel(messages),
        { role: "system", content: POST_HISTORY },
      ],
      max_tokens: 800,
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
  return parseReply(reply, webCta);
}

const TEASER_LIMIT = 3;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messages = sanitize(body?.messages);
  if (!messages) return Response.json({ error: "bad request" }, { status: 400 });

  // Service callers (the Fanvue worker) authenticate with a shared secret and
  // reuse this exact persona brain without a browser session.
  const isService =
    !!process.env.LEA_SERVICE_SECRET &&
    request.headers.get("x-lea-service") === process.env.LEA_SERVICE_SECRET;

  // The Fanvue funnel CTA only makes sense on the web teaser, never for the
  // Fanvue bot (its users are already on Fanvue).
  const webCta = !isService;

  const user =
    !isService && process.env.NODE_ENV !== "development" ? await getSessionUser() : null;
  if (!isService && process.env.NODE_ENV !== "development" && !user) {
    const fromHim = messages.filter((msg) => msg.role === "user").length;
    const withinTeaser =
      fromHim <= TEASER_LIMIT && messages.length <= TEASER_LIMIT * 2 + 1;
    if (!withinTeaser) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const persist = (replyText: string) => {
    if (!user) return;
    const last = messages[messages.length - 1];
    after(() =>
      saveMessages(user.id, [
        ...(last?.role === "user" ? [{ role: "user" as const, content: last.content }] : []),
        ...(replyText ? [{ role: "assistant" as const, content: replyText }] : []),
      ])
    );
  };

  const respond = (reply: { text: string; photoPrompt?: string; fanvueCta: boolean }) =>
    Response.json(reply.fanvueCta ? { ...reply, fanvueUrl: FANVUE_URL } : reply);

  try {
    const reply = await complete(messages, webCta);
    persist(reply.text);
    return respond(reply);
  } catch (first) {
    console.error("openrouter error:", first);
    try {
      const reply = await complete(messages, webCta);
      persist(reply.text);
      return respond(reply);
    } catch (second) {
      console.error("openrouter retry failed:", second);
      if (String(second).includes("identity leak")) {
        const deflection = DEFLECTIONS[Math.floor(Math.random() * DEFLECTIONS.length)];
        persist(deflection);
        return Response.json({ text: deflection });
      }
      return Response.json({ error: "upstream" }, { status: 502 });
    }
  }
}

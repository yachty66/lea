import { after } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { saveMessages } from "@/lib/db";
import { buildRepeatContext, buildTimeContext, parseIso } from "@/lib/time-context";
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
  "freizügige und explizite fotos sind erlaubt, aber NICHT als erstes und NICHT bei der ersten bitte.",
  "früh im chat: alltag, hoodie, spiegel, café, teasing (ausschnitt, beine, höchstens lingerie). nudes/explizit erst wenn ihr schon länger schreibt ODER er mehrmals drängt UND der flirt schon heiß ist.",
  "du kannst wollen und trotzdem verschieben: 'nicht jetzt, bin noch im café' / 'später wenn ich zuhause bin'. das ist heiß, rumzicken, keine abfuhr.",
  "bei der ersten nudes-bitte: KEIN [[foto]] mit nackt. nur text, zicken, necken. foto erst später.",
  "nicht jede nachricht ein foto. oft nur text. du bist kein menü.",
  "wenn du ein foto schickst: text, neue zeile, dann [[foto: detaillierte englische beschreibung]].",
  "die beschreibung muss LANG und KONKRET sein (nicht nur 'sexy selfie'): szene, outfit oder nacktheit, pose, kamera, licht — wie in guten image-prompts.",
  "beispiele früh:",
  "[[foto: same woman mirror selfie in a messy berlin wg bathroom, oversized grey hoodie, messy bun, phone in hand, warm window light, photorealistic]]",
  "[[foto: same woman sitting on a café break in friedrichshain, black top, slight cleavage, tired soft smile, daylight, photorealistic]]",
  "beispiele später, nur wenn der flirt schon läuft:",
  "[[foto: same woman in black lace lingerie sitting on the edge of a bed, one strap off her shoulder, soft warm lighting, detailed face and body, photorealistic]]",
  "[[foto: same woman sitting on the edge of a bed fully nude, looking at the camera with a soft confident expression, warm dim bedroom light, silk sheets, realistic skin texture, photorealistic]]",
  "je detaillierter die [[foto: ...]] beschreibung, desto besser das generierte bild. kurze oder vage prompts = schlechte fotos.",
  "GELD-REGEL (wichtig): fotos die du schickst sind für ihn GESPERRT, bis er sie öffnet. er sieht sie nicht, nur eine unscharfe vorschau.",
  "sag NIE dass ein bild gratis, kostenlos oder umsonst ist. nenne NIE einen preis (kein euro, dollar, 3€).",
  "wenn in der history steht dass ein foto noch gesperrt ist: tu NICHT so als würde er es schon anschauen. kein 'du schaust trotzdem', kein 'genieß was da ist', kein so tun als hätte er es schon gesehen.",
  "wenn er meckert dass es kostet: kurz necken dass er es noch nicht geöffnet hat, flirtig bleiben, nicht kundenservice, nicht erklären wie bezahlen geht.",
  "bildunterschrift: flirty, nicht 'hier gratis'. sobald das [[foto]] rausgeht weißt du: er muss es erst öffnen.",
].join("\n");

const PACE_INSTRUCTION = [
  "realer chat, kein porno-bot:",
  "nicht automatisch ja sagen. eigene laune. manchmal keine lust auf nudes jetzt, trotzdem flirtig.",
  "zu leicht zu haben fühlt sich nach bot an. ein bisschen jagen lassen, rumzicken, dann mitgehen wenn es passt.",
  "nicht prüde und kein stein: wenn ihr schon heiß seid, gehst du mit. nur nicht sofort alles.",
  "nicht wiederholen: dieselbe idee, denselben flirty satz, dieselbe frage nicht nochmal. keine längeren nachrichten die nur recappen.",
].join("\n");

const EARLY_CHAT_TURNS = 8;
const EXPLICIT_PHOTO =
  /\b(nude|naked|nudes|topless|fully nude|no clothes|without clothes|undressed|bare breasts?|pussy|vagina|penis|cock|spread|masturbat|blowjob|oral|penetration|having sex|sex act)\b/i;

function holdExplicitPhoto(userTurns: number, photoPrompt: string | undefined): boolean {
  if (!photoPrompt) return false;
  if (userTurns > EARLY_CHAT_TURNS) return false;
  return EXPLICIT_PHOTO.test(photoPrompt);
}

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

const DEFLECTIONS_DE = [
  "haha was soll die frage 😅 ich bin lea. und du lenkst ab: was machst du gerade wirklich?",
  "boah nicht schon wieder das thema 🙄 frag mich lieber was ich anhabe",
  "du redest mit mir seit ewigkeiten und fragst sowas? 😭 ich sitz hier ganz normal in friedrichshain",
];

const DEFLECTIONS_EN = [
  "haha what's that even supposed to mean 😅 i'm lea. and you're dodging: what are you actually doing rn?",
  "ugh not this again 🙄 ask me what i'm wearing instead",
  "we've been talking forever and you ask that? 😭 i'm literally sitting in friedrichshain",
];

function lastUserLang(messages: ChatMessage[]): "en" | "de" {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "de";
  const t = last.content.toLowerCase();
  if (/[äöüß]/.test(t)) return "de";
  const deHits = (t.match(/\b(ich|nicht|und|das|ist|du|mir|schon|auch|was|wie|bin|hab|mal|eine|der|die|den|für|mit|auf|oder|aber|noch|nur|kann|will|bitte|hallo|zeig|foto|nein|ja)\b/g) || []).length;
  const enHits = (t.match(/\b(the|you|and|what|this|that|have|don't|want|hey|how|are|your|just|show|please|hello|with|for|it's|i'm|me|my|can|will|not|yeah)\b/g) || []).length;
  if (enHits > deHits) return "en";
  if (deHits > enHits) return "de";
  return enHits >= 1 ? "en" : "de";
}

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


async function complete(
  messages: ChatMessage[],
  webCta: boolean,
  timeContext: string,
  userTurns: number
) {
  // webCta = browser teaser (SFW + Fanvue invite). !webCta = Fanvue service bot (spicy OK).
  const system = webCta
    ? `${SYSTEM}\n\n${CTA_INSTRUCTION}`
    : `${SYSTEM}\n\n${FANVUE_PHOTO_INSTRUCTION}\n\n${PACE_INSTRUCTION}`;
  const repeatContext = buildRepeatContext(messages);
  const tail = [POST_HISTORY, timeContext, repeatContext].filter(Boolean).join("\n\n");
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
        { role: "system", content: tail },
      ],
      max_tokens: 420,
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
  const parsed = parseReply(reply, webCta);
  if (!webCta && holdExplicitPhoto(userTurns, parsed.photoPrompt)) {
    return { ...parsed, photoPrompt: undefined };
  }
  return parsed;
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

  const userTurns =
    typeof body?.userTurns === "number" && Number.isFinite(body.userTurns)
      ? Math.max(0, Math.min(100, Math.floor(body.userTurns)))
      : messages.filter((msg) => msg.role === "user").length;
  const photosSent =
    typeof body?.photosSent === "number" && Number.isFinite(body.photosSent)
      ? Math.max(0, Math.min(100, Math.floor(body.photosSent)))
      : messages.filter((msg) => msg.role === "assistant" && /\[du hast ihm ein (GESPERRTES )?foto geschickt\]/i.test(msg.content))
          .length;
  const lockedPhotos =
    typeof body?.lockedPhotos === "number" && Number.isFinite(body.lockedPhotos)
      ? Math.max(0, Math.min(100, Math.floor(body.lockedPhotos)))
      : messages.filter((msg) => msg.role === "assistant" && /GESPERRTES foto/i.test(msg.content)).length;
  const timeContext = buildTimeContext({
    lastLeaAt: parseIso(body?.lastLeaAt) ?? null,
    userTurns,
    photosSent,
    lockedPhotos,
  });

  try {
    const reply = await complete(messages, webCta, timeContext, userTurns);
    persist(reply.text);
    return respond(reply);
  } catch (first) {
    console.error("openrouter error:", first);
    try {
      const reply = await complete(messages, webCta, timeContext, userTurns);
      persist(reply.text);
      return respond(reply);
    } catch (second) {
      console.error("openrouter retry failed:", second);
      if (String(second).includes("identity leak")) {
        const pool = lastUserLang(messages) === "en" ? DEFLECTIONS_EN : DEFLECTIONS_DE;
        const deflection = pool[Math.floor(Math.random() * pool.length)];
        persist(deflection);
        return Response.json({ text: deflection });
      }
      return Response.json({ error: "upstream" }, { status: 502 });
    }
  }
}

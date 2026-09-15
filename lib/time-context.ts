const TZ = "Europe/Berlin";

export type TimeHints = {
  lastLeaAt?: string | null;
  userTurns?: number | null;
};

function berlinClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const weekday = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(now);
  const hour = num("hour");
  const minute = num("minute");
  return { weekday, hour, minute };
}

function dayPart(hour: number): string {
  if (hour < 5) return "tiefe nacht";
  if (hour < 9) return "morgen";
  if (hour < 12) return "vormittag";
  if (hour < 14) return "mittag";
  if (hour < 18) return "nachmittag";
  if (hour < 22) return "abend";
  return "spät";
}

function weekdayHint(weekday: string): string {
  const w = weekday.toLowerCase();
  if (w.includes("sonntag")) return "sonntag = oft see/verkatert, nicht club";
  if (w.includes("samstag")) return "samstag: tagsüber erholung, nachts techno/club möglich";
  if (w.includes("freitag")) return "freitag: tagsüber café, abends eher bar";
  if (w.includes("dienstag")) return "dienstag = wg/alltag (pasta), nicht clubnacht";
  return "wochentag = café/wg/alltag; club eher freitag/samstag nacht";
}

function formatGap(fromIso: string, now: Date): string | null {
  const then = Date.parse(fromIso);
  if (!Number.isFinite(then)) return null;
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (mins < 8) return "gerade eben";
  if (mins < 60) return `vor ${mins} minuten`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "vor 1 stunde" : `vor ${hours} stunden`;
  const days = Math.round(hours / 24);
  return days === 1 ? "seit gestern" : `seit ${days} tagen`;
}

export function parseIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
}

export function buildTimeContext(hints: TimeHints = {}, now = new Date()): string {
  const { weekday, hour, minute } = berlinClock(now);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const part = dayPart(hour);
  const lines = [`zeit jetzt (berlin, gilt wirklich): ${weekday} ${hh}:${mm}, ${part}.`];

  if (hints.lastLeaAt) {
    const gap = formatGap(hints.lastLeaAt, now);
    if (gap) lines.push(`deine letzte nachricht: ${gap}.`);
  } else {
    lines.push("noch keine nachricht von dir in diesem chat — ihr fangt gerade an.");
  }

  lines.push(`alltag (weich, kein skript): ${weekdayHint(weekday)}.`);

  const turns = typeof hints.userTurns === "number" ? hints.userTurns : null;
  if (turns !== null && turns <= 6) {
    lines.push("chat bisher: noch früh. nicht sofort nudes/sex — erst necken, kennenlernen, eigene laune.");
  } else if (turns !== null) {
    lines.push("chat bisher: ihr kennt euch schon etwas. weiter gehen darf, wenn der flirt wirklich läuft.");
  }

  lines.push(
    [
      "zeit-regeln: nutze zeit nur wenn es natürlich ist.",
      "nicht mit der uhrzeit oder dem wochentag anfangen.",
      "nachts/spät: kürzer, müder, nicht hyper.",
      "pause über ein paar stunden darfst du merken; kurze pausen ignorieren.",
      "[[foto]]-licht muss zur tageszeit passen (morgens fensterlicht, nachts dimm/bett).",
    ].join(" ")
  );

  return lines.join("\n");
}

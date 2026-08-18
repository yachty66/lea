"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

type Msg = {
  id: number;
  who: "in" | "out";
  text: string;
};

const OPENER = "na endlich. jetzt kenn ich dich wenigstens 🙂 wie war dein tag?";

const FALLBACKS = [
  "sorry, mein handy spinnt gerade. was hast du gesagt?",
  "warte kurz, schlechtes netz hier. erzähl nochmal?",
  "hier ist gerade chaos im café, schreib mir das nochmal 🙈",
];

const PHOTOS = [
  { src: "/images/cafe.jpg", alt: "Lea beim Kaffee" },
  { src: "/images/lake.jpg", alt: "Lea am See" },
  { src: "/images/kitchen.jpg", alt: "Lea in der Küche" },
  { src: "/images/bar.jpg", alt: "Lea an der Bar" },
];

function sessionUser(data: unknown): User | null {
  const anyData = data as { user?: User; session?: { user?: User } } | null;
  return anyData?.user ?? anyData?.session?.user ?? null;
}

export default function Chat() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const lastReply = useRef(-1);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).has("preview")
    ) {
      setUser({ id: "preview" });
      setMsgs([{ id: 0, who: "in", text: OPENER }]);
      setReady(true);
      return;
    }
    authClient
      .getSession()
      .then(({ data }) => {
        const u = sessionUser(data);
        if (!u) {
          router.replace("/");
          return;
        }
        setUser(u);
        const saved = window.localStorage.getItem(`lea-chat-${u.id}`);
        if (saved) {
          const parsed = JSON.parse(saved) as Msg[];
          setMsgs(parsed);
          nextId.current = parsed.reduce((max, m) => Math.max(max, m.id), 0) + 1;
        } else {
          setMsgs([{ id: 0, who: "in", text: OPENER }]);
        }
        setReady(true);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (user && user.id !== "preview" && msgs.length) {
      window.localStorage.setItem(`lea-chat-${user.id}`, JSON.stringify(msgs));
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, typing, user]);

  const resetChat = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimer.current = window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    setConfirmReset(false);
    if (user && user.id !== "preview") {
      window.localStorage.removeItem(`lea-chat-${user.id}`);
    }
    nextId.current = 1;
    setTyping(false);
    setMsgs([{ id: 0, who: "in", text: OPENER }]);
  };

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;

    const history = [...msgs, { id: nextId.current++, who: "out" as const, text }];
    setMsgs(history);
    setDraft("");
    setTyping(true);

    let reply: string;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((msg) => ({
            role: msg.who === "out" ? "user" : "assistant",
            content: msg.text,
          })),
        }),
      });
      if (!response.ok) throw new Error(`chat api ${response.status}`);
      const data = await response.json();
      reply = data.reply;
    } catch (error) {
      console.error("chat error:", error);
      let pick = Math.floor(Math.random() * FALLBACKS.length);
      if (pick === lastReply.current) pick = (pick + 1) % FALLBACKS.length;
      lastReply.current = pick;
      reply = FALLBACKS[pick];
    }

    setTyping(false);
    setMsgs((current) => [...current, { id: nextId.current++, who: "in", text: reply }]);
  };

  if (!ready) {
    return (
      <div className="chat-shell">
        <p className="chat-loading">lea kommt gleich…</p>
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <div className="chat-page">
        <header className="chat-top">
          <img src="/images/cafe.jpg" alt="Lea" className="chat-avatar" />
          <div className="chat-who">
            <p className="chat-name">Lea</p>
            <p className="chat-status">online</p>
          </div>
          <button type="button" className="chat-out" onClick={resetChat}>
            {confirmReset ? "sicher?" : "neu anfangen"}
          </button>
          <button type="button" className="chat-out" onClick={signOut}>
            raus
          </button>
        </header>

        <div className="chat-main" ref={logRef}>
          {msgs.map((msg) => (
            <div key={msg.id} className={`bubble ${msg.who}`}>
              {msg.text}
            </div>
          ))}
          {typing && <div className="bubble in typing">•••</div>}
        </div>

        <form className="chat-compose chat-bottom" onSubmit={onSubmit}>
          <input
            type="text"
            autoComplete="off"
            placeholder="Nachricht schreiben…"
            maxLength={500}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" aria-label="Senden">
            ↑
          </button>
        </form>
      </div>

      <aside className="chat-side">
        <div className="side-slider">
          <img src={PHOTOS[photo].src} alt={PHOTOS[photo].alt} />
          <button
            type="button"
            className="side-nav side-prev"
            aria-label="Vorheriges Foto"
            onClick={() => setPhoto((photo + PHOTOS.length - 1) % PHOTOS.length)}
          >
            ‹
          </button>
          <button
            type="button"
            className="side-nav side-next"
            aria-label="Nächstes Foto"
            onClick={() => setPhoto((photo + 1) % PHOTOS.length)}
          >
            ›
          </button>
          <div className="side-dots">
            {PHOTOS.map((p, i) => (
              <button
                type="button"
                key={p.src}
                className={i === photo ? "on" : ""}
                aria-label={`Foto ${i + 1}`}
                onClick={() => setPhoto(i)}
              />
            ))}
          </div>
        </div>
        <div className="side-info">
          <p className="side-meta">23 · Berlin</p>
          <h2>Lea</h2>
          <p className="side-bio">
            schreibt zu viel. kocht zu viel pasta. sitzt zu oft alleine an der bar. wohnt in einer
            2er-wg in friedrichshain und tut so als würde sie noch studieren.
          </p>
        </div>
      </aside>
    </div>
  );
}

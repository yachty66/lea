"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth/client";
import { TypingDots, playPing } from "@/lib/fx";
import card from "@/lea.card.json";

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
  photo?: string;
  desc?: string;
};

const OPENER = card.data.first_mes;

const FALLBACKS = [
  "netz ist gerade weg. schick das nochmal?",
];

const PHOTOS = [
  { src: "/images/alex.jpg", alt: "Lea am Alexanderplatz" },
  { src: "/images/street.jpg", alt: "Lea in Friedrichshain" },
  { src: "/images/fit.jpg", alt: "Lea im Ausgeh-Outfit" },
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
  const [photoPending, setPhotoPending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
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
        posthog.identify(u.id, { email: u.email, name: u.name });
        const saved = window.localStorage.getItem(`lea-chat-${u.id}`);
        let initial: Msg[];
        if (saved) {
          initial = JSON.parse(saved) as Msg[];
          nextId.current = initial.reduce((max, m) => Math.max(max, m.id), 0) + 1;
        } else {
          initial = [{ id: 0, who: "in", text: OPENER }];
        }
        setMsgs(initial);
        setReady(true);
        const pending = window.localStorage.getItem("lea-pending");
        if (pending) {
          window.localStorage.removeItem("lea-pending");
          void send(pending, initial);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    if (user && user.id !== "preview" && msgs.length) {
      window.localStorage.setItem(`lea-chat-${user.id}`, JSON.stringify(msgs));
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, typing, photoPending, user]);

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
    posthog.capture("chat_reset");
  };

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    await send(text);
  };

  const downscale = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 768;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const onPickPhoto = async (file: File) => {
    if (typing || photoPending) return;
    let dataUri: string;
    try {
      dataUri = await downscale(file);
    } catch (error) {
      console.error("image read error:", error);
      return;
    }
    const photoMsg: Msg = { id: nextId.current++, who: "out", text: "", photo: dataUri };
    const history = [...msgs, photoMsg];
    setMsgs(history);
    setTyping(true);
    posthog.capture("user_photo_sent");
    try {
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      const data = await response.json();
      if (typeof data.description === "string") photoMsg.desc = data.description;
    } catch (error) {
      console.error("vision error:", error);
    }
    await converse(history);
  };

  const send = async (text: string, base?: Msg[]) => {
    const history = [...(base ?? msgs), { id: nextId.current++, who: "out" as const, text }];
    posthog.capture("message_sent", { length: text.length, history_length: history.length });
    await converse(history);
  };

  const asContent = (msg: Msg): string => {
    if (!msg.photo) return msg.text;
    if (msg.who === "out") {
      return `${msg.text}\n[er schickt dir ein foto. darauf zu sehen: ${msg.desc || "keine beschreibung verfügbar"}]`.trim();
    }
    return `${msg.text}\n[foto geschickt]`.trim();
  };

  const converse = async (history: Msg[]) => {
    setMsgs(history);
    setTyping(true);

    let reply = "";
    let photoPrompt: string | undefined;
    let failed = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((msg) => ({
            role: msg.who === "out" ? "user" : "assistant",
            content: asContent(msg),
          })),
        }),
      });
      if (!response.ok) throw new Error(`chat api ${response.status}`);
      const data = await response.json();
      reply = typeof data.text === "string" ? data.text : data.reply;
      photoPrompt = typeof data.photoPrompt === "string" ? data.photoPrompt : undefined;
    } catch (error) {
      console.error("chat error:", error);
      failed = true;
      let pick = Math.floor(Math.random() * FALLBACKS.length);
      if (pick === lastReply.current) pick = (pick + 1) % FALLBACKS.length;
      lastReply.current = pick;
      reply = FALLBACKS[pick];
    }

    posthog.capture("reply_received", { with_photo: photoPrompt !== undefined, fallback: failed });

    setTyping(false);
    if (reply) {
      setMsgs((current) => [...current, { id: nextId.current++, who: "in", text: reply }]);
      playPing();
    }

    if (photoPrompt !== undefined) {
      setPhotoPending(true);
      try {
        const response = await fetch("/api/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: photoPrompt }),
        });
        if (!response.ok) throw new Error(`photo api ${response.status}`);
        const data = await response.json();
        if (typeof data.photo === "string") {
          setMsgs((current) => [
            ...current,
            { id: nextId.current++, who: "in", text: "", photo: data.photo },
          ]);
          playPing();
        }
      } catch (error) {
        console.error("photo error:", error);
      } finally {
        setPhotoPending(false);
      }
    }
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
          <img src="/images/street.jpg" alt="Lea" className="chat-avatar" />
          <div className="chat-who">
            <p className="chat-name">Lea</p>
            <p className="chat-status">online</p>
          </div>
          <button type="button" className="chat-out" onClick={resetChat}>
            {confirmReset ? "sicher?" : "neu anfangen"}
          </button>
          <button type="button" className="chat-out" onClick={signOut}>
            abmelden
          </button>
        </header>

        <div className="chat-main" ref={logRef}>
          {msgs.map((msg) => (
            <div key={msg.id} className={`bubble ${msg.who}`}>
              {msg.photo && (
                <img
                  src={msg.photo}
                  alt=""
                  className="bubble-photo"
                  onClick={() => setLightbox(msg.photo!)}
                />
              )}
              {msg.text}
            </div>
          ))}
          {typing && (
            <div className="bubble in typing">
              <TypingDots />
            </div>
          )}
          {photoPending && (
            <div className="bubble in typing photo-pending">
              <span className="photo-pending-label">📷 macht ein foto</span>
              <TypingDots />
            </div>
          )}
        </div>

        <form className="chat-compose chat-bottom" onSubmit={onSubmit}>
          <label className="attach-btn" aria-label="Foto senden">
            +
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onPickPhoto(file);
              }}
            />
          </label>
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
          <img
            src={PHOTOS[photo].src}
            alt={PHOTOS[photo].alt}
            onClick={() => setLightbox(PHOTOS[photo].src)}
            style={{ cursor: "zoom-in" }}
          />
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
            schreibt zu viel. kocht zu viel pasta. sitzt zu oft alleine an der bar. bleibt im club
            immer bis 9. wohnt in einer 2er-wg in friedrichshain und tut so als würde sie noch
            studieren.
          </p>
        </div>
      </aside>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button
            type="button"
            className="lightbox-close"
            aria-label="Schließen"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          <img src={lightbox} alt="" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

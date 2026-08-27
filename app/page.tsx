"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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

const DISCORD_INVITE = "https://discord.gg/Yqe8F4yGs";

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [wall, setWall] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const galleryKey = useRef<string | null>(null);
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
      galleryKey.current = "lea-gallery-preview";
      setMsgs([{ id: 0, who: "in", text: OPENER }]);
      setReady(true);
      return;
    }
    authClient
      .getSession()
      .then(({ data }) => {
        const u = sessionUser(data);
        if (!u) {
          setMsgs([{ id: 0, who: "in", text: OPENER }]);
          setReady(true);
          return;
        }
        setUser(u);
        posthog.identify(u.id, { email: u.email, name: u.name });
        galleryKey.current = `lea-gallery-${u.id}`;

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

        // Build the collection as a UNION of every source we have, deduped:
        // 1) local gallery cache  2) photos still in the chat history  3) Neon.
        const merge = (...lists: string[][]) => {
          const seen = new Set<string>();
          const out: string[] = [];
          for (const list of lists) {
            for (const url of list) {
              if (url && !seen.has(url)) {
                seen.add(url);
                out.push(url);
              }
            }
          }
          return out;
        };
        let cached: string[] = [];
        try {
          cached = JSON.parse(window.localStorage.getItem(galleryKey.current) || "[]") as string[];
        } catch {
          /* ignore */
        }
        const fromChat = initial.filter((m) => m.who === "in" && m.photo).map((m) => m.photo!);
        const localMerged = merge(cached, fromChat);
        setGallery(localMerged);
        window.localStorage.setItem(galleryKey.current, JSON.stringify(localMerged));

        fetch("/api/gallery")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (Array.isArray(data?.photos)) {
              // Neon first (newest, durable), then anything local Neon doesn't have yet.
              const full = merge(data.photos as string[], localMerged);
              setGallery(full);
              window.localStorage.setItem(galleryKey.current!, JSON.stringify(full));
            }
          })
          .catch(() => {
            /* keep local merge */
          });

        const pending = window.localStorage.getItem("lea-pending");
        if (pending) {
          window.localStorage.removeItem("lea-pending");
          void send(pending, initial);
        }
      })
      .catch(() => {
        setMsgs([{ id: 0, who: "in", text: OPENER }]);
        setReady(true);
      });
  }, []);

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

  useEffect(() => {
    if (wall) posthog.capture("auth_wall_shown");
  }, [wall]);

  const signIn = async () => {
    const pending = draft.trim();
    if (pending) window.localStorage.setItem("lea-pending", pending);
    posthog.capture("signin_clicked", { from_wall: wall });
    setSigningIn(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        newUserCallbackURL: "/",
        errorCallbackURL: "/",
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      setSigningIn(false);
    }
  };

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

  const collectPhoto = (url: string) => {
    setGallery((current) => {
      if (current.includes(url)) return current;
      const next = [url, ...current];
      if (galleryKey.current) {
        window.localStorage.setItem(galleryKey.current, JSON.stringify(next));
      }
      return next;
    });
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    if (!user) {
      window.localStorage.setItem("lea-pending", text);
      setWall(true);
      return;
    }
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
    if (!user) {
      setWall(true);
      return;
    }
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
          collectPhoto(data.photo);
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
          <a
            className="discord-chip"
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord beitreten"
          >
            <DiscordMark />
          </a>
          {user ? (
            <>
              {gallery.length > 0 && (
                <button type="button" className="chat-out" onClick={() => setShowGallery(true)}>
                  sammlung ({gallery.length})
                </button>
              )}
              <button type="button" className="chat-out" onClick={resetChat}>
                {confirmReset ? "sicher?" : "neu anfangen"}
              </button>
              <button type="button" className="chat-out" onClick={signOut}>
                abmelden
              </button>
            </>
          ) : (
            <button type="button" className="chat-out" onClick={signIn} disabled={signingIn}>
              {signingIn ? "google…" : "mit google"}
            </button>
          )}
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
        <p className="chat-legal">lea · berlin · 18+ · ki-charakter</p>
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
          <p className="side-legal">lea · berlin · 18+ · ki-charakter</p>
        </div>
      </aside>

      {showGallery && (
        <div className="gallery-overlay" onClick={() => setShowGallery(false)}>
          <div className="gallery-panel" onClick={(event) => event.stopPropagation()}>
            <div className="gallery-head">
              <h3>deine sammlung</h3>
              <button
                type="button"
                className="gallery-close"
                aria-label="Schließen"
                onClick={() => setShowGallery(false)}
              >
                ×
              </button>
            </div>
            <div className="gallery-grid">
              {gallery.map((url) => (
                <img key={url} src={url} alt="" onClick={() => setLightbox(url)} />
              ))}
            </div>
          </div>
        </div>
      )}

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

      {wall && !user && (
        <div className="authwall-backdrop" onClick={() => setWall(false)}>
          <div className="authwall" onClick={(event) => event.stopPropagation()}>
            <div className="authwall-photo">
              <img src="/images/bar.jpg" alt="Lea an der Bar" />
              <span className="authwall-mark">lea</span>
            </div>
            <div className="authwall-panel">
              <button
                type="button"
                className="authwall-close"
                aria-label="Schließen"
                onClick={() => setWall(false)}
              >
                ×
              </button>
              <h2>sie wartet schon.</h2>
              <p className="authwall-sub">
                erstell dir kostenlos einen account, dann weiß lea wer ihr schreibt.
              </p>
              <button type="button" className="btn btn-light authwall-google" onClick={signIn} disabled={signingIn}>
                <GoogleMark />
                {signingIn ? "redirecting…" : "mit google weiter"}
              </button>
              <p className="authwall-terms">mit der anmeldung bestätigst du, dass du mindestens 18 bist.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscordMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 127.14 96.36" aria-hidden="true">
      <path
        fill="currentColor"
        d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

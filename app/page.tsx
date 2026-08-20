"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth/client";
import card from "@/lea.card.json";

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

type Bubble = {
  id: number;
  who: "in" | "out" | "in typing";
  text: string;
};

const OPENER = card.data.first_mes;

const TEASER_LIMIT = 3;

const FALLBACK = "netz ist gerade weg. schick das nochmal? 😅";

function sessionUser(data: unknown): User | null {
  const anyData = data as { user?: User; session?: { user?: User } } | null;
  return anyData?.user ?? anyData?.session?.user ?? null;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 0, who: "in", text: OPENER },
  ]);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(0);
  const [locked, setLocked] = useState(false);
  const [wall, setWall] = useState(false);
  const [typing, setTyping] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => setUser(sessionUser(data)))
      .catch((error) => console.error("session error:", error))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [bubbles]);

  useEffect(() => {
    if (locked) posthog.capture("paywall_shown");
  }, [locked]);

  const signIn = async () => {
    posthog.capture("signin_clicked", { from_wall: wall, from_paywall: locked });
    setSigningIn(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/chat",
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
  };

  const addBubble = (who: Bubble["who"], text: string) => {
    const id = nextId.current++;
    setBubbles((current) => [...current, { id, who, text }]);
    return id;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || locked || typing) return;
    if (!user) {
      setWall(true);
      posthog.capture("auth_wall_shown");
      return;
    }
    if (!user && sent >= TEASER_LIMIT) {
      setLocked(true);
      return;
    }

    const history = [...bubbles, { id: nextId.current++, who: "out" as const, text }];
    setBubbles(history);
    setDraft("");
    const nextSent = sent + 1;
    setSent(nextSent);
    setTyping(true);
    const typingId = addBubble("in typing", "•••");

    let reply = FALLBACK;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((bubble) => ({
            role: bubble.who === "out" ? "user" : "assistant",
            content: bubble.text,
          })),
        }),
      });
      if (!response.ok) throw new Error(`chat api ${response.status}`);
      const data = await response.json();
      if (typeof data.text === "string" && data.text.trim()) reply = data.text;
    } catch (error) {
      console.error("chat error:", error);
    }

    setTyping(false);
    setBubbles((current) =>
      current
        .filter((bubble) => bubble.id !== typingId)
        .concat({ id: nextId.current++, who: "in", text: reply })
    );
    if (!user && nextSent >= TEASER_LIMIT) {
      window.setTimeout(() => setLocked(true), 700);
    }
  };

  return (
    <>
      <main>
        <section className="hero">
          <img src="/images/hero.jpg" alt="Lea in Berlin" className="hero-photo" />
          <div className="hero-shade" />

          {authReady &&
            (user ? (
              <div className="auth-chip">
                {user.image ? (
                  <img src={user.image} alt="" />
                ) : (
                  <span className="auth-fallback">
                    {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>{user.name?.split(" ")[0] || user.email}</span>
                <button type="button" onClick={signOut}>
                  raus
                </button>
              </div>
            ) : (
              <button type="button" className="auth-chip auth-chip-login" onClick={signIn} disabled={signingIn}>
                {signingIn ? "google…" : "mit google"}
              </button>
            ))}

          <div className="hero-inner">
            <div className="hero-id">
              <p className="hero-meta">23 · Berlin</p>
              <h1>Lea</h1>
              <p className="hero-lines">
                schreibt zu viel.
                <br />
                kocht zu viel pasta.
                <br />
                sitzt zu oft alleine an der bar.
              </p>
            </div>

            <div className={`hero-chat${locked && !user ? " locked" : ""}`}>
              {user ? (
                <a className="btn btn-light" href="/chat">
                  weiter mit lea schreiben
                </a>
              ) : (
                <>
              <div className="chat-log" ref={logRef}>
                {bubbles.map((bubble) => (
                  <div key={bubble.id} className={`bubble ${bubble.who}`}>
                    {bubble.text}
                  </div>
                ))}
              </div>

              <form className="chat-compose" onSubmit={onSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  autoComplete="off"
                  placeholder="Nachricht schreiben…"
                  maxLength={240}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={locked && !user}
                />
                <button type="submit" aria-label="Senden">
                  ↑
                </button>
              </form>

              {locked && (
                <div className="paywall">
                  <p>lea wartet noch.</p>
                  <p className="paywall-sub">weiter schreiben: mit google, dann kennt sie dich.</p>
                  <button type="button" className="btn btn-light" onClick={signIn} disabled={signingIn}>
                    <GoogleMark />
                    {signingIn ? "redirecting…" : "mit google weiter"}
                  </button>
                </div>
              )}
                </>
              )}
            </div>

            <p className="hero-age">18+</p>
          </div>
        </section>

        <section className="week" aria-labelledby="week-title">
          <div className="section-head">
            <p className="eyebrow">letzte woche</p>
            <h2 id="week-title">so sah’s aus.</h2>
          </div>
          <div className="film">
            <figure>
              <img src="/images/lake.jpg" alt="Lea am See" />
              <figcaption>
                <span>sonntag</span>
                am see. viel zu lange in der sonne.
              </figcaption>
            </figure>
            <figure>
              <img src="/images/kitchen.jpg" alt="Lea in der Küche" />
              <figcaption>
                <span>dienstag</span>
                soße für vier. bin alleine.
              </figcaption>
            </figure>
            <figure>
              <img src="/images/bar.jpg" alt="Lea an der Bar" />
              <figcaption>
                <span>freitag, 1 uhr</span>
                tue so als würde ich auf jemanden warten.
              </figcaption>
            </figure>
            <figure>
              <img src="/images/cafe.jpg" alt="Lea beim Kaffee" />
              <figcaption>
                <span>heute</span>
                kaffee bevor ich ins café muss.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="bio">
          <p>
            ich bin lea. wohn in einer 2er-wg in friedrichshain, arbeite im café und tu so als würde ich noch
            studieren.
          </p>
          <p>
            meistens koche ich zu viel. manchmal sitze ich an der bar und warte auf niemanden bestimmtes.
          </p>
          <p>schreib mir. ich antworte, versprochen.</p>
        </section>
      </main>

      <footer>
        <p>lea · berlin · 18+</p>
      </footer>

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
    </>
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

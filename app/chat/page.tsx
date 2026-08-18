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

const REPLIES = [
  "hahah okay das merk ich mir.",
  "warte, erzähl mal mehr. ich hab zeit, die soße muss eh noch köcheln.",
  "ich sitz gerade am fenster und alle draußen sehen aus als hätten sie es eilig. wohin eigentlich?",
  "du klingst wie jemand der zu wenig schläft. ich auch.",
  "okay und was machst du wenn du nicht gerade mit mir schreibst?",
  "ich hab heute drei cappuccini falsch gemacht. der vierte war perfekt. so ungefähr läuft mein leben.",
  "das würde ich gern sehen. foto oder es ist nicht passiert.",
  "freitag bin ich wieder an der bar. nur so gesagt.",
  "mhm. und jetzt die ehrliche version bitte.",
  "ich koch gerade für vier. bist du hungrig?",
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
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const lastReply = useRef(-1);

  useEffect(() => {
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
    if (user && msgs.length) {
      window.localStorage.setItem(`lea-chat-${user.id}`, JSON.stringify(msgs));
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, typing, user]);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;

    setMsgs((current) => [...current, { id: nextId.current++, who: "out", text }]);
    setDraft("");
    setTyping(true);

    let pick = Math.floor(Math.random() * REPLIES.length);
    if (pick === lastReply.current) pick = (pick + 1) % REPLIES.length;
    lastReply.current = pick;
    const reply = REPLIES[pick];

    window.setTimeout(() => {
      setTyping(false);
      setMsgs((current) => [...current, { id: nextId.current++, who: "in", text: reply }]);
    }, 900 + Math.random() * 1200);
  };

  if (!ready) {
    return (
      <div className="chat-page">
        <p className="chat-loading">lea kommt gleich…</p>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="chat-top">
        <img src="/images/cafe.jpg" alt="Lea" className="chat-avatar" />
        <div className="chat-who">
          <p className="chat-name">Lea</p>
          <p className="chat-status">online</p>
        </div>
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
  );
}

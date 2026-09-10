"use client";

import { useEffect, useState } from "react";
import styles from "./here.module.css";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const OK = "lea_age_ok";

// Lightweight analytics: a single sendBeacon per event straight to PostHog, so
// this page never loads the posthog-js bundle. Beacons survive the CTA
// navigation to Fanvue, which posthog-js clicks sometimes don't.
function track(event: string, props: Record<string, unknown> = {}) {
  if (!KEY || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    let id = localStorage.getItem("lea_anon");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("lea_anon", id);
    }
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: id,
      properties: { ...props, $current_url: location.href },
    });
    navigator.sendBeacon(`${HOST}/i/v0/e/`, new Blob([body], { type: "application/json" }));
  } catch {
    /* best-effort */
  }
}

export default function AgeGate() {
  // Default open so no-JS / first-paint always shows the gate; hidden on mount
  // for returning visitors who already confirmed.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let confirmed = false;
    try {
      confirmed = localStorage.getItem(OK) === "1";
    } catch {
      /* storage blocked — keep the gate */
    }
    if (confirmed) setOpen(false);
    track("here_view", { gated: !confirmed });

    // Track CTA clicks without wiring an onClick onto every server-rendered link.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-ph]") as HTMLElement | null;
      if (el?.dataset.ph) track(el.dataset.ph);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!open) return null;

  const confirm = () => {
    try {
      localStorage.setItem(OK, "1");
    } catch {
      /* ignore */
    }
    track("here_age_confirmed");
    setOpen(false);
  };

  const leave = () => {
    location.href = "https://www.google.com";
  };

  return (
    <div className={styles.gate} role="dialog" aria-modal="true" aria-label="Altersbestätigung">
      <div className={styles.gateCard}>
        <p className={styles.gateName}>Lea</p>
        <p className={styles.gateTitle}>Nur für Erwachsene</p>
        <p className={styles.gateText}>
          Diese Seite ist für Personen ab 18 Jahren. Bist du 18 oder älter?
        </p>
        <button type="button" className={styles.gateYes} onClick={confirm}>
          Ja, ich bin 18+
        </button>
        <button type="button" className={styles.gateNo} onClick={leave}>
          Nein, ich bin jünger
        </button>
        <p className={styles.gateLegal}>
          Mit dem Fortfahren bestätigst du dein Alter. Lea ist ein KI-Charakter.
        </p>
      </div>
    </div>
  );
}

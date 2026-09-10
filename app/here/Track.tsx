"use client";

import { useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

// Lightweight analytics: one sendBeacon per event straight to PostHog, so this
// page never loads the posthog-js bundle. Beacons survive the click-through.
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

export default function Track() {
  useEffect(() => {
    track("here_view");
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-ph]") as HTMLElement | null;
      if (el?.dataset.ph) track("here_click", { target: el.dataset.ph });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

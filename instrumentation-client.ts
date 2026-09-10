// Load PostHog everywhere EXCEPT the /here funnel page, which is kept
// ruthlessly thin. The dynamic import means posthog-js is never fetched on
// /here (it uses its own sendBeacon instead).
if (
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  typeof window !== "undefined" &&
  !window.location.pathname.startsWith("/here")
) {
  import("posthog-js").then(({ default: posthog }) => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
      defaults: "2025-05-24",
      capture_exceptions: true,
    });
  });
}

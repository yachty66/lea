import { exchangeCode, fanvueFetch } from "@/lib/fanvue";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? match[1] : null;
}

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf8"><title>${title}</title>` +
      `<style>body{font-family:system-ui;background:#0a0908;color:#f2ede4;display:grid;place-items:center;height:100vh;margin:0}` +
      `.card{max-width:520px;padding:32px;border:1px solid #2a2724;border-radius:16px}` +
      `code{background:#14120f;padding:2px 6px;border-radius:6px;font-size:13px;word-break:break-all}h1{font-size:22px}</style></head>` +
      `<body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return page("Fehler", `<h1>OAuth-Fehler</h1><p>${error}: ${url.searchParams.get("error_description") ?? ""}</p>`);
  if (!code) return page("Fehler", `<h1>Kein Code</h1><p>Fanvue hat keinen Authorization-Code geschickt.</p>`);

  const verifier = readCookie(request, "fanvue_pkce");
  const savedState = readCookie(request, "fanvue_state");
  if (!verifier) return page("Fehler", `<h1>Session abgelaufen</h1><p>Starte den Flow neu über /api/fanvue/auth.</p>`);
  if (savedState && state && savedState !== state) {
    return page("Fehler", `<h1>State stimmt nicht</h1><p>Möglicher CSRF, abgebrochen.</p>`);
  }

  try {
    await exchangeCode(code, verifier);
    let who = "";
    try {
      const me = await fanvueFetch("/users/me");
      if (me.ok) {
        const data = await me.json();
        who = data?.handle ? ` als <code>@${data.handle}</code>` : "";
      }
    } catch {
      /* ignore */
    }
    return page(
      "Verbunden",
      `<h1>✅ Lea ist mit Fanvue verbunden${who}</h1><p>Der Refresh-Token ist gespeichert. Du kannst dieses Fenster schließen.</p>`
    );
  } catch (err) {
    return page("Fehler", `<h1>Token-Tausch fehlgeschlagen</h1><p><code>${String(err).slice(0, 300)}</code></p>`);
  }
}

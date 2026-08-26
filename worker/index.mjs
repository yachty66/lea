// Lea Fanvue fallback poller.
// The webhook (/api/fanvue/webhook on leaberlin) handles messages in real time.
// This worker is a safety net: every FALLBACK_MS it asks leaberlin to sweep any
// unread chats the webhook may have missed. All reply logic lives in leaberlin.

const BASE = process.env.LEABERLIN_BASE || "https://leaberlin.com";
const SECRET = process.env.LEA_SERVICE_SECRET;
const FALLBACK_MS = Number(process.env.FALLBACK_MS || 45000);

if (!SECRET) {
  console.error("LEA_SERVICE_SECRET missing");
  process.exit(1);
}

async function sweep() {
  try {
    const res = await fetch(`${BASE}/api/fanvue/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lea-service": SECRET },
    });
    if (!res.ok) {
      console.error("poll", res.status, (await res.text()).slice(0, 120));
      return;
    }
    const data = await res.json();
    if (data.handled) console.log(`fallback handled ${data.handled} chat(s)`);
  } catch (e) {
    console.error("sweep error:", e.message);
  }
}

console.log(`lea fallback poller up, sweeping every ${FALLBACK_MS}ms via ${BASE}`);
await sweep();
setInterval(sweep, FALLBACK_MS);

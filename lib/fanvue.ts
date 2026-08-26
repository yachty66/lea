import { neon } from "@neondatabase/serverless";

export const FANVUE_API = "https://api.fanvue.com";
export const FANVUE_AUTH = "https://auth.fanvue.com/oauth2/auth";
export const FANVUE_TOKEN = "https://auth.fanvue.com/oauth2/token";
export const FANVUE_API_VERSION = "2025-06-26";
export const FANVUE_SCOPES = "read:self read:chat write:chat read:media write:media";

function db() {
  return neon(process.env.DATABASE_URL!);
}

function basicAuth() {
  const creds = `${process.env.FANVUE_CLIENT_ID}:${process.env.FANVUE_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams) {
  const res = await fetch(FANVUE_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
    },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function saveTokens(refreshToken: string, accessToken: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const sql = db();
  await sql`
    insert into fanvue_auth (id, refresh_token, access_token, expires_at, updated_at)
    values ('lea', ${refreshToken}, ${accessToken}, ${expiresAt}, now())
    on conflict (id) do update set
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      expires_at = excluded.expires_at,
      updated_at = now()`;
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.FANVUE_REDIRECT_URI!,
      code_verifier: codeVerifier,
    })
  );
  await saveTokens(data.refresh_token, data.access_token, data.expires_in ?? 3600);
  return data;
}

// Returns a valid access token, refreshing (and persisting the rotated refresh token) when needed.
export async function getAccessToken(): Promise<string> {
  const sql = db();
  const rows = await sql`select refresh_token, access_token, expires_at from fanvue_auth where id = 'lea'`;
  if (!rows.length) throw new Error("fanvue not authorized yet");
  const row = rows[0] as { refresh_token: string; access_token: string | null; expires_at: string | null };

  const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expMs - Date.now() > 60_000) {
    return row.access_token;
  }

  const data = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    })
  );
  await saveTokens(data.refresh_token ?? row.refresh_token, data.access_token, data.expires_in ?? 3600);
  return data.access_token as string;
}

export async function fanvueFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Fanvue-API-Version": FANVUE_API_VERSION,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(`${FANVUE_API}${path}`, { ...init, headers });
}

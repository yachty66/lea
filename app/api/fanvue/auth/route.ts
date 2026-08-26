import { createHash, randomBytes } from "node:crypto";
import { FANVUE_AUTH, FANVUE_SCOPES } from "@/lib/fanvue";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.FANVUE_SETUP_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authUrl = new URL(FANVUE_AUTH);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.FANVUE_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", process.env.FANVUE_REDIRECT_URI!);
  authUrl.searchParams.set("scope", FANVUE_SCOPES);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const secure = "Secure; ";
  const cookie = [
    `fanvue_pkce=${verifier}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=600`,
    `fanvue_state=${state}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=600`,
  ];
  const headers = new Headers({ Location: authUrl.toString() });
  cookie.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers });
}

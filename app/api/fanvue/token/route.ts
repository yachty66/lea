import { getAccessToken } from "@/lib/fanvue";

// Service-only: the Fanvue worker fetches a fresh access token from here so it
// never needs the client secret or refresh logic on its own host.
export async function GET(request: Request) {
  if (
    !process.env.LEA_SERVICE_SECRET ||
    request.headers.get("x-lea-service") !== process.env.LEA_SERVICE_SECRET
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const accessToken = await getAccessToken();
    return Response.json({ access_token: accessToken });
  } catch (error) {
    return Response.json({ error: String(error).slice(0, 200) }, { status: 502 });
  }
}

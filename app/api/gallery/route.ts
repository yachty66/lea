import { neon } from "@neondatabase/serverless";
import { getSessionUser } from "@/lib/auth/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ photos: [] });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      select photo_url, max(created_at) as t
      from chat_messages
      where user_id = ${user.id} and photo_url is not null
      group by photo_url
      order by t desc`;
    return Response.json({ photos: rows.map((r) => r.photo_url as string) });
  } catch (error) {
    console.error("gallery load failed:", error);
    return Response.json({ photos: [] });
  }
}

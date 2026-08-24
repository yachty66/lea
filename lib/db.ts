import { neon } from "@neondatabase/serverless";
import card from "@/lea.card.json";

export const CHARACTER_ID = "lea";
export const CHARACTER_NAME = card.data.name;

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  photoUrl?: string;
};

export async function saveMessages(userId: string, messages: StoredMessage[]) {
  if (!process.env.DATABASE_URL || messages.length === 0) return;
  try {
    const sql = neon(process.env.DATABASE_URL);
    for (const msg of messages) {
      await sql`
        insert into chat_messages (user_id, character_id, character_name, role, content, photo_url)
        values (${userId}, ${CHARACTER_ID}, ${CHARACTER_NAME}, ${msg.role}, ${msg.content}, ${msg.photoUrl ?? null})`;
    }
  } catch (error) {
    console.error("chat save failed:", error);
  }
}

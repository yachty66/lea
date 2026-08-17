import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data } = await auth.getSession();
  const anyData = data as {
    user?: SessionUser;
    session?: { user?: SessionUser };
  } | null;
  const user = anyData?.user ?? anyData?.session?.user ?? null;
  if (!user?.id) return null;
  return user;
}

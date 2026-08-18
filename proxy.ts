import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const authMiddleware = auth.middleware({ loginUrl: "/" });

export default function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "development" &&
    request.nextUrl.searchParams.has("preview")
  ) {
    return NextResponse.next();
  }
  return authMiddleware(request);
}

export const config = {
  matcher: ["/", "/chat"],
};

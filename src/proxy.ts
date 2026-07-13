import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

// Duplicated from admin-session.ts rather than shared: that module calls next/headers'
// cookies() internally, which isn't how Proxy reads cookies (req.cookies instead) — this
// is the "optimistic" cookie-signature check the Next auth guide describes, kept tiny
// enough that splitting it into a shared pure function isn't worth the indirection.
const ADMIN_SESSION_COOKIE_NAME = "sm_admin_session";
const SESSION_PAYLOAD = "admin";

function isValidAdminCookie(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (payload !== SESSION_PAYLOAD || !signature) return false;

  const expected = Buffer.from(
    createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("hex"),
    "hex"
  );
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasValidSession = isValidAdminCookie(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  if (pathname === "/admin/login") {
    if (hasValidSession) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && !hasValidSession) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};

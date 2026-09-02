import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { isLocale } from "@/lib/locale";
import { isContributeOpen, isSitePublic } from "@/lib/settings";

const intlMiddleware = createMiddleware(routing);

function stripLocalePrefix(pathname: string): string {
  const [, possibleLocale, ...rest] = pathname.split("/");
  return isLocale(possibleLocale) ? `/${rest.join("/")}` : pathname;
}

function isLocaleIndependentPage(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/closed";
}

// Duplicated from admin-session.ts rather than shared: that module calls next/headers'
// cookies() internally, which isn't how Proxy reads cookies (req.cookies instead) — this
// is the "optimistic" cookie-signature check the Next auth guide describes, kept tiny
// enough that splitting it into a shared pure function isn't worth the indirection.
const ADMIN_SESSION_COOKIE_NAME = "sm_admin_session";
const SESSION_PAYLOAD = "admin";

// Always reachable regardless of either visibility flag — /admin so the flags can be
// flipped, /closed so the redirect target itself doesn't loop, /api/cron so scheduled
// data-hygiene jobs (crisis-entry anonymization) keep running while the public site is
// closed. /api/phrases is here too (not just gated with /contribute below) since it's
// shared with Leave a Trace's own submit — gating it on contribute_open would break the
// main flow when Contribute is off, and gating it on site_public alone would break
// Contribute while the main site is closed. Its own rate limiting/moderation are the
// real defense here, not this proxy check.
const ALWAYS_ALLOWED_PREFIXES = ["/admin", "/closed", "/api/cron", "/api/phrases", "/icon.png"];

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPathname = stripLocalePrefix(pathname);

  // Admin and the closed page have one canonical, locale-independent URL. Preserve
  // the rest of the URL (including its query string) when correcting a prefixed link.
  if (publicPathname !== pathname && isLocaleIndependentPage(publicPathname)) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = publicPathname;
    return NextResponse.redirect(canonicalUrl);
  }

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

  if (ALWAYS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Independent of site_public — lets /contribute stay reachable (via its own flag)
  // while the rest of the site is closed, or vice versa: closing contribute_open alone
  // once the workshop wraps up, without touching site_public at all.
  if (publicPathname.startsWith("/contribute") && (await isContributeOpen())) {
    return intlMiddleware(request);
  }

  if (!(await isSitePublic())) {
    return NextResponse.redirect(new URL("/closed", request.url));
  }

  // API handlers deliberately remain outside locale routing. The request payload or
  // query parameter carries locale for the bilingual backend contract.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Everything except static assets — the site_public gate has to cover the public
  // experience routes and the public API routes (/api/entries, /api/phrases) alike,
  // not just page navigations.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

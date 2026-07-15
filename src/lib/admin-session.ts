import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_SESSION_COOKIE_NAME = "sm_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8h — long enough for one review session, short enough to not linger.

// Fixed payload, not a random session id like the visitor cookie (session.ts) — there's
// only one admin identity, so the cookie just needs to prove "signed with the current
// ADMIN_SESSION_SECRET," not carry an id to look up.
const SESSION_PAYLOAD = "admin";

function sign(payload: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("hex");
}

function isValidSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(signature, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyAdminPassword(password: string): boolean {
  const expected = Buffer.from(process.env.ADMIN_PASSWORD!);
  const actual = Buffer.from(password);

  // Buffers of different lengths would throw in timingSafeEqual rather than just
  // returning false, so the length check has to short-circuit first.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, `${SESSION_PAYLOAD}.${sign(SESSION_PAYLOAD)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

// Cookie-only check — same "optimistic" check proxy.ts does, exposed here too since
// proxy can't be the only line of defense for Server Actions invoked directly
// (see Next's auth guide: treat Server Actions like public endpoints).
export const isAdminSession = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!value) return false;

  const [payload, signature] = value.split(".");
  return payload === SESSION_PAYLOAD && !!signature && isValidSignature(payload, signature);
});

// Proxy already redirects unauthenticated requests away from /admin/*, but Server
// Actions can be invoked directly without going through a page render — this is the
// same check re-applied at the point of each mutation, per Next's own auth guide.
export async function requireAdminSession(): Promise<void> {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }
}

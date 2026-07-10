import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "sm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h — revisit once the "reflect later" flow is designed.

function sign(sessionId: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(sessionId).digest("hex");
}

function isValidSignature(sessionId: string, signature: string): boolean {
  const expected = Buffer.from(sign(sessionId), "hex");
  const actual = Buffer.from(signature, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Anonymous, no login: a signed cookie that recognizes the same browser across requests
// without ever identifying who's behind it (see P3 of #20). A tampered or missing cookie
// just gets replaced with a fresh session — there's no identity to lose.
export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (existing) {
    const [sessionId, signature] = existing.split(".");
    if (sessionId && signature && isValidSignature(sessionId, signature)) {
      return sessionId;
    }
  }

  const sessionId = randomUUID();
  cookieStore.set(SESSION_COOKIE_NAME, `${sessionId}.${sign(sessionId)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return sessionId;
}

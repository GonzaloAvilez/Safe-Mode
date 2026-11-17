import "server-only";
import { isRateLimited } from "@/lib/rate-limit";
import { isSuspectedBot } from "@/lib/bot-protection";
import { logRequestOutcome } from "@/lib/logging";
import { isLettersOpen } from "@/lib/settings";

// Each guard returns a Response when the request should be blocked, or null to let it
// through — /api/entries and /api/phrases compose exactly the guards they need with
// `??` instead of inheriting one fixed bundle, same small-single-purpose-module
// convention already used by rate-limit.ts/bot-protection.ts/session.ts.
export async function rateLimitGuard(ip: string, sessionId: string): Promise<Response | null> {
  if (!(await isRateLimited({ ip, sessionId }))) return null;
  logRequestOutcome(ip, "rate_limited");
  return Response.json({ error: "too many requests" }, { status: 429 });
}

export function botGuard(ip: string, honeypot: unknown, formRenderedAt: unknown): Response | null {
  if (!isSuspectedBot({ honeypot, formRenderedAt })) return null;
  logRequestOutcome(ip, "bot_suspected");
  // Same shape as the rate-limit response — no reason to tell a bot what caught it.
  return Response.json({ error: "too many requests" }, { status: 429 });
}

export function textLengthGuard(text: unknown, maxLength: number): Response | null {
  if (typeof text === "string" && text.trim().length > 0 && text.length <= maxLength) return null;
  return Response.json({ error: `text is required and must be ${maxLength} characters or fewer` }, { status: 400 });
}

// ADR-004 #212: blocks starting a correspondence or writing a letter while the founder
// keeps letters closed (letters_open in settings.ts). 503 because the request is fine,
// letters are just closed for now.
export async function lettersOpenGuard(): Promise<Response | null> {
  if (await isLettersOpen()) return null;
  return Response.json({ error: "letters are closed" }, { status: 503 });
}

import { after } from "next/server";
import { submitUserPhrase, finalizeUserPhraseModeration } from "@/lib/phrases";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";
import { PHRASE_ORIGINS, PhraseOrigin } from "@/lib/phrase-origin";
import { rateLimitGuard, botGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { resolveLocale } from "@/lib/locale";

const MAX_TEXT_LENGTH = 400;

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  const rateLimited = await rateLimitGuard(ip, sessionId);
  if (rateLimited) return rateLimited;

  const body = await request.json();
  const origin = body.origin;
  const locale = resolveLocale(body.locale);

  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, MAX_TEXT_LENGTH);
  if (blocked) return blocked;

  if (typeof origin !== "string" || origin.trim().length === 0 || !PHRASE_ORIGINS.includes(origin)) {
    return Response.json({ error: `origin doesn't have the correct value` }, { status: 400 });
  }

  if (!locale) {
    return Response.json({ error: "locale doesn't have the correct value" }, { status: 400 });
  }

  const { id } = await submitUserPhrase(body.text, origin as PhraseOrigin, locale);

  // Moderation (and the embedding it gates, see phrases.ts) runs after the response
  // goes out — the person leaving a trace never waits on it.
  after(() => finalizeUserPhraseModeration(id, body.text));

  logRequestOutcome(ip, "phrase_submitted");
  return Response.json({ ok: true });
}

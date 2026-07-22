import { after } from "next/server";
import { submitUserPhrase, finalizeUserPhraseModeration } from "@/lib/phrases";
import { isRateLimited } from "@/lib/rate-limit";
import { isSuspectedBot } from "@/lib/bot-protection";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";
import { PHRASE_ORIGINS, PhraseOrigin } from "@/lib/phrase-origin";

const MAX_TEXT_LENGTH = 120;

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isRateLimited({ ip, sessionId })) {
    logRequestOutcome(ip, "rate_limited");
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const text = body.text;
  const origin = body.origin;

  if (isSuspectedBot({ honeypot: body.honeypot, formRenderedAt: body.formRenderedAt })) {
    logRequestOutcome(ip, "bot_suspected");
    // Same shape as the rate-limit response — no reason to tell a bot what caught it.
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `text is required and must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  if (typeof origin !== "string" || origin.trim().length === 0 || !PHRASE_ORIGINS.includes(origin) ) {
    return Response.json(
      { error: `origin doesn't have the correct value` },
      { status: 400 }
    );
  }

  const { id } = await submitUserPhrase(text, origin as PhraseOrigin);

  // Moderation (and the embedding it gates, see phrases.ts) runs after the response
  // goes out — the person leaving a trace never waits on it.
  after(() => finalizeUserPhraseModeration(id, text));

  logRequestOutcome(ip, "phrase_submitted");
  return Response.json({ ok: true });
}

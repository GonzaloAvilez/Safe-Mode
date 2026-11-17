import { after } from "next/server";
import { submitUserPhrase, submitUserPhraseAcceptingLetters, finalizeUserPhraseModeration } from "@/lib/phrases";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";
import { LEAVE_A_TRACE_ORIGIN, PHRASE_ORIGINS, PhraseOrigin } from "@/lib/phrase-origin";
import { rateLimitGuard, botGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { resolveLocale } from "@/lib/locale";
import { readJsonObject } from "@/lib/request-body";
import { isLettersOpen } from "@/lib/settings";
import { pickReturnKeySentence } from "@/lib/return-key-sentences";

const MAX_TEXT_LENGTH = 400;

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  const rateLimited = await rateLimitGuard(ip, sessionId);
  if (rateLimited) return rateLimited;

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "body must be a JSON object" }, { status: 400 });

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

  if (body.acceptsLetters !== undefined && typeof body.acceptsLetters !== "boolean") {
    return Response.json({ error: "acceptsLetters must be a boolean" }, { status: 400 });
  }

  // ADR-004 OD-3 (decided 2026-11-16): only Leave a Trace phrases can accept letters.
  if (body.acceptsLetters === true && origin !== LEAVE_A_TRACE_ORIGIN) {
    return Response.json({ error: "only Leave a Trace phrases can accept letters" }, { status: 400 });
  }

  // textLengthGuard above only lets a non-empty string through.
  const text = body.text as string;

  // ADR-004 #212: the author chose to receive letters. While letters are closed the phrase
  // is still saved, just without that choice, so a trace is never lost to the flag.
  if (body.acceptsLetters === true && (await isLettersOpen())) {
    const { id, returnKey } = await submitUserPhraseAcceptingLetters(text, locale);
    after(() => finalizeUserPhraseModeration(id, text));
    logRequestOutcome(ip, "phrase_submitted");

    // The key is shown once and only its hash is stored: the response must never be cached.
    // The sentence is a gift for the key's card, picked at random and never stored.
    return Response.json(
      { ok: true, returnKey, returnKeySentence: pickReturnKeySentence(locale) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { id } = await submitUserPhrase(text, origin as PhraseOrigin, locale);

  // Moderation (and the embedding it gates, see phrases.ts) runs after the response
  // goes out — the person leaving a trace never waits on it.
  after(() => finalizeUserPhraseModeration(id, text));

  logRequestOutcome(ip, "phrase_submitted");
  return Response.json({ ok: true });
}

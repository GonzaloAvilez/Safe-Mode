import { after } from "next/server";
import { submitUserPhrase, finalizeUserPhraseModeration } from "@/lib/phrases";
import { isRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";

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

  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `text is required and must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const { id } = await submitUserPhrase(text);

  // Moderation (and the embedding it gates, see phrases.ts) runs after the response
  // goes out — the person leaving a trace never waits on it.
  after(() => finalizeUserPhraseModeration(id, text));

  logRequestOutcome(ip, "phrase_submitted");
  return Response.json({ ok: true });
}

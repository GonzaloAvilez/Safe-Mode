import { startCorrespondence } from "@/lib/correspondences";
import { LETTER_MAX_LENGTH } from "@/lib/letters";
import { botGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { isLetterRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getOrCreateSessionId } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_RESULT = {
  started: 201,
  entry_not_found: 404,
  phrase_not_connectable: 403,
} as const;

// ADR-004 #211: a visitor starts a correspondence with the author of the phrase their
// entry matched, by writing the first letter. Body: { entryId, text, honeypot,
// formRenderedAt }. On success the response carries the visitor's return key, shown once.
export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isLetterRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, LETTER_MAX_LENGTH);
  if (blocked) return blocked;

  if (typeof body.entryId !== "string" || !UUID.test(body.entryId)) {
    return Response.json({ error: "entryId must be a uuid" }, { status: 400 });
  }

  const result = await startCorrespondence({ entryId: body.entryId, sessionId, body: body.text });

  // The response can carry the return key: it must never be stored by a cache.
  return Response.json(result, { status: STATUS_BY_RESULT[result.type], headers: { "Cache-Control": "no-store" } });
}

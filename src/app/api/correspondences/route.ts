import { startCorrespondence, type StartCorrespondenceResult } from "@/lib/correspondences";
import { LETTER_MAX_LENGTH } from "@/lib/letters";
import { botGuard, lettersOpenGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { isLetterRateLimited } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

const STATUS_BY_RESULT: Record<StartCorrespondenceResult["type"], number> = {
  started: 201, // `letter.type` in the body says what happened to the letter itself
  entry_not_found: 404,
  phrase_not_connectable: 403,
  return_key_not_recognized: 401,
  return_key_not_confirmed: 403,
  own_phrase: 403,
};

// ADR-004 #211 and #212: a visitor starts a correspondence with the author of the phrase
// their entry matched, by writing the first letter. They already kept and confirmed their
// seal (POST /api/return-key, then /api/return-key/confirm), and it goes in
// "Authorization: Bearer <seal>", never in the URL. Body: { entryId, text, honeypot,
// formRenderedAt }. Trying again with the same seal writes into the same correspondence.
export async function POST(request: Request) {
  const closed = await lettersOpenGuard();
  if (closed) return closed;

  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isLetterRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const returnKey = getRequestReturnKey(request);
  if (!returnKey) return Response.json({ error: "return key required" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "body must be a JSON object" }, { status: 400 });

  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, LETTER_MAX_LENGTH);
  if (blocked) return blocked;

  if (!isUuid(body.entryId)) {
    return Response.json({ error: "entryId must be a uuid" }, { status: 400 });
  }

  // textLengthGuard above only lets a non-empty string through.
  const text = body.text as string;
  const result = await startCorrespondence({ entryId: body.entryId, sessionId, returnKey, body: text });

  return Response.json(result, { status: STATUS_BY_RESULT[result.type] });
}

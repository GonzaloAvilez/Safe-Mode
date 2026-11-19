import { createVisitorReturnKey, type CreateVisitorReturnKeyResult } from "@/lib/correspondences";
import { resolveLocale } from "@/lib/locale";
import { lettersOpenGuard } from "@/lib/public-submission-guards";
import { isReturnKeyCreateRateLimited } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { getRequestIp } from "@/lib/request-ip";
import { pickReturnKeySentence } from "@/lib/return-key-sentences";
import { getOrCreateSessionId } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

const STATUS_BY_RESULT: Record<CreateVisitorReturnKeyResult["type"], number> = {
  created: 201,
  entry_not_found: 404,
  phrase_not_connectable: 403,
};

// ADR-004 #212, seal first (design B, 2026-11-19): a visitor asks for their seal before
// writing to the phrase their entry matched. Body: { entryId, locale }. The entry only proves
// they may ask (they wrote in this session, and letters can reach that phrase); the seal isn't
// tied to it. The seal starts unconfirmed: nothing can be written with it until its holder
// confirms they kept it (POST /api/return-key/confirm).
//
// No honeypot here: no form leads to this request, and the entry it needs already passed the
// bot checks of POST /api/entries.
export async function POST(request: Request) {
  const closed = await lettersOpenGuard();
  if (closed) return closed;

  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isReturnKeyCreateRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "body must be a JSON object" }, { status: 400 });

  if (!isUuid(body.entryId)) {
    return Response.json({ error: "entryId must be a uuid" }, { status: 400 });
  }

  const locale = resolveLocale(body.locale);
  if (!locale) {
    return Response.json({ error: "locale doesn't have the correct value" }, { status: 400 });
  }

  const result = await createVisitorReturnKey({ entryId: body.entryId, sessionId });
  if (result.type !== "created") {
    return Response.json(result, { status: STATUS_BY_RESULT[result.type] });
  }

  // The seal is shown once and only its hash is stored: the response must never be cached.
  // The sentence is a gift for the seal's card, picked at random and never stored.
  return Response.json(
    { type: "created", returnKey: result.returnKey, returnKeySentence: pickReturnKeySentence(locale) },
    { status: STATUS_BY_RESULT.created, headers: { "Cache-Control": "no-store" } }
  );
}

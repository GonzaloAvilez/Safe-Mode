import { submitLetterWithReturnKey } from "@/lib/correspondences";
import { LETTER_MAX_LENGTH, type SubmitLetterResult } from "@/lib/letters";
import { botGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { isLetterRateLimited } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

// The status says whether a letter was written; `type` in the body says what happened to
// it (waiting for review, crisis resources, or rejected and why), same as the first letter
// in POST /api/correspondences.
const STATUS_BY_RESULT: Record<SubmitLetterResult["type"], number> = {
  held: 201,
  crisis: 201,
  rejected: 201,
  not_allowed: 409, // closed, awaiting review, or not this side's turn
  not_found: 404,
};

// ADR-004 #211: either side writes its next letter. Authorized only by the return key, in
// `Authorization: Bearer <key>`; the key decides which side is writing. Body: { text,
// honeypot, formRenderedAt }.
export async function POST(request: Request, ctx: RouteContext<"/api/correspondences/[id]/letters">) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isLetterRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const returnKey = getRequestReturnKey(request);
  if (!returnKey) return Response.json({ error: "return key required" }, { status: 401 });

  // A path id that isn't a uuid can't name any correspondence.
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ type: "not_found" }, { status: 404 });

  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "body must be a JSON object" }, { status: 400 });

  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, LETTER_MAX_LENGTH);
  if (blocked) return blocked;

  // textLengthGuard above only lets a non-empty string through.
  const text = body.text as string;
  const result = await submitLetterWithReturnKey({ correspondenceId: id, returnKey, body: text });

  return Response.json(result, { status: STATUS_BY_RESULT[result.type] });
}

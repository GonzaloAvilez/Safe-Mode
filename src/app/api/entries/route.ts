import { submitEntry } from "@/lib/entries";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";
import { rateLimitGuard, botGuard, textLengthGuard } from "@/lib/public-submission-guards";

const MAX_TEXT_LENGTH = 800;

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  const rateLimited = await rateLimitGuard(ip, sessionId);
  if (rateLimited) return rateLimited;

  const body = await request.json();

  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, MAX_TEXT_LENGTH);
  if (blocked) return blocked;

  const result = await submitEntry(body.text, sessionId, body.scaleBefore);
  logRequestOutcome(ip, result.type);

  return Response.json(result);
}

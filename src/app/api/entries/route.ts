import { submitEntry } from "@/lib/entries";
import { isRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";

const MAX_TEXT_LENGTH = 800;

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isRateLimited({ ip, sessionId })) {
    logRequestOutcome(ip, "rate_limited");
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const text = body.text;
  const scaleBefore = body.scaleBefore;

  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `text is required and must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const result = await submitEntry(text, sessionId, scaleBefore);
  logRequestOutcome(ip, result.type);

  return Response.json(result);
}

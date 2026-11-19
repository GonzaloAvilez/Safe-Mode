import { isPhraseConnectableNow } from "@/lib/correspondences";
import { submitEntry } from "@/lib/entries";
import { getRequestIp } from "@/lib/request-ip";
import { logRequestOutcome } from "@/lib/logging";
import { getOrCreateSessionId } from "@/lib/session";
import { rateLimitGuard, botGuard, textLengthGuard } from "@/lib/public-submission-guards";
import { resolveLocale } from "@/lib/locale";

const MAX_TEXT_LENGTH = 800;

// Whether Mirror may offer to write to the matched phrase (ADR-004 #212). A failed lookup only
// hides that offer: the entry is already saved and matched, and must still reach Mirror.
async function readPhraseConnectable(phraseId: string): Promise<boolean> {
  try {
    return await isPhraseConnectableNow(phraseId);
  } catch (error) {
    console.error("couldn't read whether a phrase accepts letters", error);
    return false;
  }
}

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  const rateLimited = await rateLimitGuard(ip, sessionId);
  if (rateLimited) return rateLimited;

  const body = await request.json();
  const locale = resolveLocale(body.locale);

  const blocked = botGuard(ip, body.honeypot, body.formRenderedAt) ?? textLengthGuard(body.text, MAX_TEXT_LENGTH);
  if (blocked) return blocked;

  if (!locale) {
    return Response.json({ error: "locale doesn't have the correct value" }, { status: 400 });
  }

  const result = await submitEntry(body.text, sessionId, body.scaleBefore, locale);
  logRequestOutcome(ip, result.type);

  if (result.type !== "matched") return Response.json(result);

  const connectable = await readPhraseConnectable(result.phrase.id);
  return Response.json({ ...result, phrase: { ...result.phrase, connectable } });
}

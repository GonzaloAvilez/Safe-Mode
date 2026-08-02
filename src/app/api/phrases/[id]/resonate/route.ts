import { isResonateRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getOrCreateSessionId } from "@/lib/session";
import { recordResonance } from "@/lib/phrase-resonances";

// Not to be confused with /api/entries/[id]/resonate — that one is Mirror's
// wants_reply toggle on a specific entry the visitor already submitted. This is a
// private per-phrase signal, reachable from Home by anyone, so it needs real
// anonymous-abuse protection that entry's resonate route doesn't.
export async function POST(request: Request, ctx: RouteContext<"/api/phrases/[id]/resonate">) {
  const { id } = await ctx.params;
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isResonateRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  await recordResonance(id, sessionId);
  return Response.json({ ok: true });
}

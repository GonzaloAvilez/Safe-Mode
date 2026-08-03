import { isResonateRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getOrCreateSessionId } from "@/lib/session";
import { recordResonance } from "@/lib/phrase-resonances";

// Not to be confused with /api/entries/[id]/connect — that one is Mirror's
// wants_reply toggle, a separate "I'd like to reach this person" signal. This route
// is the phrase-level resonate signal, reachable from both Observe (browsing) and
// Mirror (the phrase that matched your own entry) — same phrase, same table either
// way, deduped per session by the composite primary key. Reachable by anyone, so it
// needs real anonymous-abuse protection that the connect route doesn't.
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

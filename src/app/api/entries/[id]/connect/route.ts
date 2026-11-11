import { setWantsReply } from "@/lib/responses";
import { getOrCreateSessionId } from "@/lib/session";

// Backs Mirror's "I would love to connect" toggle — a distinct signal from resonate
// (see /api/phrases/[id]/resonate): this is about wanting to reach the person who
// wrote the matched phrase, not about the phrase itself landing.
//
// Only the session that wrote the entry can change it. Another session's entry, or an
// unknown id, answers 404 either way, so the route can't be used to probe which ids exist.
export async function POST(request: Request, ctx: RouteContext<"/api/entries/[id]/connect">) {
  const { id } = await ctx.params;
  const body = await request.json();

  if (typeof body.value !== "boolean") {
    return Response.json({ error: "value must be a boolean" }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const updated = await setWantsReply(id, sessionId, body.value);
  if (!updated) {
    return Response.json({ error: "entry not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

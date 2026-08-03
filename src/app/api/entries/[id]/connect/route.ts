import { setWantsReply } from "@/lib/responses";

// Backs Mirror's "I would love to connect" toggle — a distinct signal from resonate
// (see /api/phrases/[id]/resonate): this is about wanting to reach the person who
// wrote the matched phrase, not about the phrase itself landing.
export async function POST(request: Request, ctx: RouteContext<"/api/entries/[id]/connect">) {
  const { id } = await ctx.params;
  const body = await request.json();

  if (typeof body.value !== "boolean") {
    return Response.json({ error: "value must be a boolean" }, { status: 400 });
  }

  await setWantsReply(id, body.value);
  return Response.json({ ok: true });
}

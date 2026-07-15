import { setWantsReply } from "@/lib/responses";

export async function POST(request: Request, ctx: RouteContext<"/api/entries/[id]/resonate">) {
  const { id } = await ctx.params;
  const body = await request.json();

  if (typeof body.value !== "boolean") {
    return Response.json({ error: "value must be a boolean" }, { status: 400 });
  }

  await setWantsReply(id, body.value);
  return Response.json({ ok: true });
}

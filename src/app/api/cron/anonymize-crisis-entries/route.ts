import { anonymizeExpiredCrisisEntries } from "@/lib/crisis-entries";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const anonymizedCount = await anonymizeExpiredCrisisEntries();

  return Response.json({ anonymizedCount });
}

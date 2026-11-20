import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { anonymizeExpiredCrisisEntries } from "@/lib/crisis-entries";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const anonymizedCount = await anonymizeExpiredCrisisEntries();

  return Response.json({ anonymizedCount });
}

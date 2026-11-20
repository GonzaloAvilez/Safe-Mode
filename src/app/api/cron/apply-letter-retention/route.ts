import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { anonymizeExpiredLetters, closeInactiveCorrespondences } from "@/lib/letter-retention";

// Daily (vercel.json). Responds with counts only, never letter content (ADR-004 layer 8).
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const anonymizedLetterCount = await anonymizeExpiredLetters();
  const closedCorrespondenceCount = await closeInactiveCorrespondences();

  return Response.json({ anonymizedLetterCount, closedCorrespondenceCount });
}

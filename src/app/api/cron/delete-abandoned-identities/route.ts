import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { deleteAbandonedIdentities } from "@/lib/abandoned-identities";

// Daily (vercel.json): removes the identities of seals asked for and never confirmed (ADR-004 #212).
// Responds with a count only, never which identities (ADR-004 layer 8).
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deletedIdentityCount = await deleteAbandonedIdentities();

  return Response.json({ deletedIdentityCount });
}

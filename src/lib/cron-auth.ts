import "server-only";

// Vercel calls each cron with "Authorization: Bearer <CRON_SECRET>". Comparing against
// `Bearer ${process.env.CRON_SECRET}` alone lets "Bearer undefined" in wherever the secret isn't
// set, so a missing secret refuses every request instead (found writing #212's cleanup cron).
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

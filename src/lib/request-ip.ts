import "server-only";

// Vercel's edge network sets x-forwarded-for itself, overwriting whatever the client sent.
export function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}

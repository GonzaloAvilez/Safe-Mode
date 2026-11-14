import "server-only";

// The return key travels in `Authorization: Bearer <key>` (#211 decision B), never in the
// URL, so it can't end up in server logs, browser history or a Referer header. Whether the
// key is well formed and real is checked later, by resolveIdentityFromReturnKey.
const BEARER = /^Bearer\s+(\S+)$/i;

export function getRequestReturnKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  return header?.match(BEARER)?.[1] ?? null;
}

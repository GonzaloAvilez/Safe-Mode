import "server-only";

// A route's JSON body as a plain object, or null when the body isn't valid JSON or isn't an
// object (null, an array, a string, a number). Routes answer 400 on null; reading a field
// straight off `await request.json()` crashes into a 500 for a body like `{` or `null`.
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null; // malformed or empty body
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

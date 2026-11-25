import "server-only";
import { resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import { isNotificationSubscriptionRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";

// ADR-005: what every /api/notifications/subscription route checks before touching a row. The
// seal goes in "Authorization: Bearer <key>", never in the URL, same as /api/mailbox. Rate limit,
// then the seal's presence, then the body, then the seal lookup: a malformed request never reaches
// the database.

export type GuardedSubscriptionRequest<T> = { response: Response } | { identityId: string; input: T };

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? body : null;
  } catch {
    return null;
  }
}

export async function guardSubscriptionRequest<T>(
  request: Request,
  parse: (body: Record<string, unknown>) => T | null
): Promise<GuardedSubscriptionRequest<T>> {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();
  if (await isNotificationSubscriptionRateLimited({ ip, sessionId })) {
    return { response: Response.json({ error: "too many requests" }, { status: 429 }) };
  }

  const returnKey = getRequestReturnKey(request);
  if (!returnKey) return { response: Response.json({ error: "return key required" }, { status: 401 }) };

  const body = await readBody(request);
  const input = body && parse(body);
  if (!input) return { response: Response.json({ error: "invalid request" }, { status: 400 }) };

  const identityId = await resolveIdentityFromReturnKey(returnKey);
  if (!identityId) return { response: Response.json({ error: "return key not recognized" }, { status: 401 }) };

  return { identityId, input };
}

// { endpoint }: the device a request is about.
export function parseEndpointBody(body: Record<string, unknown>): { endpoint: string } | null {
  return typeof body.endpoint === "string" && body.endpoint.length > 0 ? { endpoint: body.endpoint } : null;
}

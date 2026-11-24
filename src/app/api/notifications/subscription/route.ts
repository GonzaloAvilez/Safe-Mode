import { resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import { isLocale, type Locale } from "@/lib/locale";
import {
  parsePushSubscription,
  removePushSubscription,
  savePushSubscription,
  type PushSubscriptionKeys,
} from "@/lib/notifications/push-subscriptions";
import { isNotificationSubscriptionRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";

// ADR-005: whoever holds a seal turns notices on or off for this device. The seal goes in
// "Authorization: Bearer <key>", never in the URL, same as /api/mailbox. An unrecognized seal gets
// 401. There's no way to touch a subscription without the seal: someone without it opts out by
// revoking the browser's permission, and the next notice's 404/410 removes the device.

type Guarded<T> = { response: Response } | { identityId: string; input: T };

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? body : null;
  } catch {
    return null;
  }
}

// Rate limit, then the body, then the seal: a malformed request never reaches the database.
async function guard<T>(request: Request, parse: (body: Record<string, unknown>) => T | null): Promise<Guarded<T>> {
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

function parseSubscribe(body: Record<string, unknown>): { subscription: PushSubscriptionKeys; locale: Locale } | null {
  const subscription = parsePushSubscription(body.subscription);
  return subscription && isLocale(body.locale) ? { subscription, locale: body.locale } : null;
}

function parseUnsubscribe(body: Record<string, unknown>): { endpoint: string } | null {
  return typeof body.endpoint === "string" && body.endpoint.length > 0 ? { endpoint: body.endpoint } : null;
}

// { subscription: PushSubscription JSON, locale: "en" | "es" }. Subscribing again from the same
// device updates it. The locale is the route's at subscribe time: notices come in that language.
export async function POST(request: Request) {
  const guarded = await guard(request, parseSubscribe);
  if ("response" in guarded) return guarded.response;

  await savePushSubscription(guarded.identityId, guarded.input.subscription, guarded.input.locale);
  return new Response(null, { status: 204 });
}

// { endpoint }. Only this identity's row on this device goes: another identity on the same device
// keeps its notices. Removing one that isn't there answers the same.
export async function DELETE(request: Request) {
  const guarded = await guard(request, parseUnsubscribe);
  if ("response" in guarded) return guarded.response;

  await removePushSubscription(guarded.identityId, guarded.input.endpoint);
  return new Response(null, { status: 204 });
}

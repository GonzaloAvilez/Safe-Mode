import { isLocale, type Locale } from "@/lib/locale";
import {
  parsePushSubscription,
  removePushSubscription,
  savePushSubscription,
  type PushSubscriptionKeys,
} from "@/lib/notifications/push-subscriptions";
import { guardSubscriptionRequest, parseEndpointBody } from "@/lib/notifications/subscription-request";

// ADR-005: whoever holds a seal turns notices on or off for this device. The seal goes in
// "Authorization: Bearer <key>", never in the URL, same as /api/mailbox. An unrecognized seal gets
// 401. There's no way to touch a subscription without the seal: someone without it opts out by
// revoking the browser's permission, and the next notice's 404/410 removes the device.

function parseSubscribe(body: Record<string, unknown>): { subscription: PushSubscriptionKeys; locale: Locale } | null {
  const subscription = parsePushSubscription(body.subscription);
  return subscription && isLocale(body.locale) ? { subscription, locale: body.locale } : null;
}

// { subscription: PushSubscription JSON, locale: "en" | "es" }. Subscribing again from the same
// device updates it. The locale is the route's at subscribe time: notices come in that language.
export async function POST(request: Request) {
  const guarded = await guardSubscriptionRequest(request, parseSubscribe);
  if ("response" in guarded) return guarded.response;

  await savePushSubscription(guarded.identityId, guarded.input.subscription, guarded.input.locale);
  return new Response(null, { status: 204 });
}

// { endpoint }. Only this identity's row on this device goes: another identity on the same device
// keeps its notices. Removing one that isn't there answers the same.
export async function DELETE(request: Request) {
  const guarded = await guardSubscriptionRequest(request, parseEndpointBody);
  if ("response" in guarded) return guarded.response;

  await removePushSubscription(guarded.identityId, guarded.input.endpoint);
  return new Response(null, { status: 204 });
}

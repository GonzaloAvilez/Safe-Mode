import { isPushSubscribed } from "@/lib/notifications/push-subscriptions";
import { guardSubscriptionRequest, parseEndpointBody } from "@/lib/notifications/subscription-request";

// ADR-005: whether the seal's identity asked for notices on this device, so LetterNotificationsToggle
// shows what's true. The mailbox opens an identity that may have opted in on an earlier visit, and
// the browser alone can't tell: one push subscription is shared by every identity on the device.
//
// A POST, not a GET: the endpoint identifies the device, so it travels in the body, never in the
// URL. It passes the same checks as subscribing (rate limit, the seal as a Bearer token).

// { endpoint } → { subscribed: boolean }.
export async function POST(request: Request) {
  const guarded = await guardSubscriptionRequest(request, parseEndpointBody);
  if ("response" in guarded) return guarded.response;

  const subscribed = await isPushSubscribed(guarded.identityId, guarded.input.endpoint);
  return Response.json({ subscribed }, { headers: { "Cache-Control": "no-store" } });
}

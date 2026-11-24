import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";
import type { Locale } from "@/lib/locale";

// ADR-005: the devices an identity asked to be notified on (push_subscriptions). A row belongs to
// an identity, never to a credential, and there's one per identity per device: one browser holds
// a single push subscription per site, and one person can own several identities.

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type StoredPushSubscription = PushSubscriptionKeys & { locale: string };

// Generous bounds for what browsers hand out. They only keep junk out of the table.
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

// A browser's PushSubscription as JSON ({ endpoint, keys: { p256dh, auth } }), or null when it
// isn't one. The table repeats the https and non-empty checks; this answers 400 before that.
export function parsePushSubscription(value: unknown): PushSubscriptionKeys | null {
  if (typeof value !== "object" || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isBoundedString(endpoint, MAX_ENDPOINT_LENGTH) || !endpoint.startsWith("https://")) return null;
  if (typeof keys !== "object" || keys === null) return null;
  if (!isBoundedString(keys.p256dh, MAX_KEY_LENGTH) || !isBoundedString(keys.auth, MAX_KEY_LENGTH)) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

// Subscribing again from the same device updates that row (new keys, new locale) instead of
// adding another.
export async function savePushSubscription(identityId: string, subscription: PushSubscriptionKeys, locale: Locale): Promise<void> {
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert({ identity_id: identityId, ...subscription, locale }, { onConflict: "identity_id,endpoint" });
  unwrap(null, error);
}

// Opting out is per identity: only this identity's row on this device goes. Another identity on
// the same device keeps getting its notices.
export async function removePushSubscription(identityId: string, endpoint: string): Promise<void> {
  const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("identity_id", identityId).eq("endpoint", endpoint);
  unwrap(null, error);
}

export async function listPushSubscriptions(identityId: string): Promise<StoredPushSubscription[]> {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, locale")
    .eq("identity_id", identityId);
  return unwrap(data, error);
}

// The push service answered that this device is gone (404/410): the person revoked permission or
// the subscription expired. It's gone for every identity on it.
export async function removePushEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  unwrap(null, error);
}

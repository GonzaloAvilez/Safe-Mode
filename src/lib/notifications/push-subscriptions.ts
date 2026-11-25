import "server-only";
import { ECDH } from "node:crypto";
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

// The push services the browsers Refugio supports hand out endpoints on. The server sends a request
// to every stored endpoint, and anyone can get a seal, so an endpoint anywhere else is refused:
// otherwise the server could be made to call arbitrary hosts (SSRF).
//   Chrome and the Chromium browsers: fcm.googleapis.com. Firefox: updates.push.services.mozilla.com.
//   Safari, macOS and iOS: *.push.apple.com. Edge on Windows: *.notify.windows.com.
const PUSH_SERVICE_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const PUSH_SERVICE_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

// What web-push needs to encrypt a notice (RFC 8291): the browser's P-256 public key, 65 bytes, and
// an auth secret of at least 16 bytes, both base64url.
const P256DH_BYTES = 65;
const MIN_AUTH_BYTES = 16;
// Strict alphabet first: Buffer's base64url decoding skips characters it doesn't know instead of
// failing, so "abc!!!def" would otherwise decode to 4 bytes.
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function decodeBase64Url(value: string): Buffer | null {
  return BASE64URL.test(value) ? Buffer.from(value, "base64url") : null;
}

// 65 bytes isn't enough on its own: a value that isn't a point on the curve passes web-push's
// length check and then fails when the notice is encrypted.
function isUsableP256dh(value: string): boolean {
  const bytes = decodeBase64Url(value);
  if (!bytes || bytes.length !== P256DH_BYTES) return false;
  try {
    ECDH.convertKey(bytes, "prime256v1", undefined, undefined, "uncompressed");
    return true;
  } catch {
    return false;
  }
}

function isUsableAuthSecret(value: string): boolean {
  const bytes = decodeBase64Url(value);
  return bytes !== null && bytes.length >= MIN_AUTH_BYTES;
}

// A well-formed https URL on one of the push services above: default port, no credentials. The
// web-push channel checks it again before every send.
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  return PUSH_SERVICE_HOSTS.has(url.hostname) || PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

// A browser's PushSubscription as JSON ({ endpoint, keys: { p256dh, auth } }), or null when it
// isn't one a notice could be sent to. The table repeats the https and non-empty checks; this
// answers 400 before that, so unusable keys are never saved, nor replace a device's good ones.
export function parsePushSubscription(value: unknown): PushSubscriptionKeys | null {
  if (typeof value !== "object" || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isBoundedString(endpoint, MAX_ENDPOINT_LENGTH) || !isAllowedPushEndpoint(endpoint)) return null;
  if (typeof keys !== "object" || keys === null) return null;
  if (!isBoundedString(keys.p256dh, MAX_KEY_LENGTH) || !isBoundedString(keys.auth, MAX_KEY_LENGTH)) return null;
  if (!isUsableP256dh(keys.p256dh) || !isUsableAuthSecret(keys.auth)) return null;
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

// Whether this identity asked for notices on this device, so the toggle shows what's true.
export async function isPushSubscribed(identityId: string, endpoint: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint")
    .eq("identity_id", identityId)
    .eq("endpoint", endpoint)
    .maybeSingle();
  return unwrap(data, error) !== null;
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

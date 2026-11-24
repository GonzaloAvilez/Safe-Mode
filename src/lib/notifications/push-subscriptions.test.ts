import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

const { parsePushSubscription, isAllowedPushEndpoint } = await import("@/lib/notifications/push-subscriptions");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
// A valid endpoint padded to an exact length, so only the length can make it fail.
const endpointOfLength = (length: number) => {
  const prefix = "https://fcm.googleapis.com/fcm/send/";
  return prefix + "x".repeat(length - prefix.length);
};
// A real browser's keys: a P-256 public key (65 bytes) and a 16-byte auth secret, base64url.
const P256DH = "BOurom9kflp01No-zioM65hciEAM-MMRCQa7ay_DYcyWH5WaXuRf5Dt13EGdKGZhxZV4eZPWKu2UVtNxoeh-eak";
const AUTH = "1uAPnazz4eYyz1AHnTEuhA";
// The same key with its last bit flipped: still 65 bytes, but not a point on the curve.
const P256DH_OFF_CURVE = "BOurom9kflp01No-zioM65hciEAM-MMRCQa7ay_DYcyWH5WaXuRf5Dt13EGdKGZhxZV4eZPWKu2UVtNxoeh-eag";
// The same point compressed (33 bytes): on the curve, but web-push only takes the 65-byte form.
const P256DH_COMPRESSED = "A-urom9kflp01No-zioM65hciEAM-MMRCQa7ay_DYcyW";
const browserSubscription = (overrides: Record<string, unknown> = {}) => ({
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: P256DH, auth: AUTH },
  ...overrides,
});
const withKeys = (keys: Record<string, unknown>) => browserSubscription({ keys: { p256dh: P256DH, auth: AUTH, ...keys } });

describe("parsePushSubscription", () => {
  it("reads a browser's PushSubscription JSON, keeping only what's stored", () => {
    expect(parsePushSubscription(browserSubscription())).toEqual({ endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "subscription"],
    ["no endpoint", browserSubscription({ endpoint: undefined })],
    ["an http endpoint", browserSubscription({ endpoint: "http://push.example/1" })],
    ["an empty endpoint", browserSubscription({ endpoint: "" })],
    ["an endpoint over 2048 characters", browserSubscription({ endpoint: endpointOfLength(2049) })],
    ["an endpoint that isn't a push service", browserSubscription({ endpoint: "https://example.com/push/1" })],
    ["no keys", browserSubscription({ keys: undefined })],
    ["keys that aren't an object", browserSubscription({ keys: "keys" })],
    ["an empty p256dh", withKeys({ p256dh: "" })],
    ["an empty auth", withKeys({ auth: "" })],
    ["a key over 512 characters", withKeys({ auth: "k".repeat(513) })],
    ["a key that isn't a string", withKeys({ p256dh: 42 })],
    // What web-push needs to encrypt (RFC 8291): anything else would be saved and fail at send.
    ["a p256dh that isn't base64url", withKeys({ p256dh: "p256dh-key!" })],
    ["a p256dh that isn't 65 bytes", withKeys({ p256dh: P256DH.slice(0, -2) })],
    ["a p256dh that isn't a point on the curve", withKeys({ p256dh: P256DH_OFF_CURVE })],
    ["a compressed p256dh (33 bytes)", withKeys({ p256dh: P256DH_COMPRESSED })],
    ["an auth secret under 16 bytes", withKeys({ auth: AUTH.slice(0, -2) })],
    ["an auth secret that isn't base64url", withKeys({ auth: "auth secret, 16+ bytes long" })],
  ])("rejects %s", (_, value) => {
    expect(parsePushSubscription(value)).toBeNull();
  });

  it("accepts the longest endpoint and keys it allows", () => {
    const endpoint = endpointOfLength(2048);
    expect(parsePushSubscription(browserSubscription({ endpoint, keys: { p256dh: P256DH, auth: "k".repeat(512) } }))).not.toBeNull();
  });
});

// The server sends a request to every stored endpoint, so only the browsers' push services may be
// one (SSRF).
describe("isAllowedPushEndpoint", () => {
  it.each([
    ["Chrome", "https://fcm.googleapis.com/fcm/send/abc:APA91b"],
    ["Firefox", "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA"],
    ["Safari", "https://web.push.apple.com/QGuQyavXutnMH"],
    ["Edge", "https://wns2-by3p.notify.windows.com/w/?token=BQYAAA"],
  ])("accepts %s's push service", (_, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["not a URL", "fcm.googleapis.com/fcm/send/1"],
    ["a malformed URL", "https://fcm googleapis.com/send/1"],
    ["no hostname", "https://"],
    ["http", "http://fcm.googleapis.com/fcm/send/1"],
    ["another host", "https://example.com/fcm/send/1"],
    ["a private IP", "https://10.0.0.1/fcm/send/1"],
    ["localhost", "https://localhost/fcm/send/1"],
    ["a lookalike that only starts with a push host", "https://fcm.googleapis.com.evil.example/send/1"],
    ["a lookalike that ends without the dot", "https://evilpush.apple.com/1"],
    ["an explicit port", "https://fcm.googleapis.com:8443/fcm/send/1"],
    ["credentials", "https://user:secret@fcm.googleapis.com/fcm/send/1"],
  ])("rejects %s", (_, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

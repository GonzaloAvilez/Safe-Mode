import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

const { parsePushSubscription } = await import("@/lib/notifications/push-subscriptions");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const browserSubscription = (overrides: Record<string, unknown> = {}) => ({
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
  ...overrides,
});

describe("parsePushSubscription", () => {
  it("reads a browser's PushSubscription JSON, keeping only what's stored", () => {
    expect(parsePushSubscription(browserSubscription())).toEqual({ endpoint: ENDPOINT, p256dh: "p256dh-key", auth: "auth-secret" });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "subscription"],
    ["no endpoint", browserSubscription({ endpoint: undefined })],
    ["an http endpoint", browserSubscription({ endpoint: "http://push.example/1" })],
    ["an empty endpoint", browserSubscription({ endpoint: "" })],
    ["an endpoint over 2048 characters", browserSubscription({ endpoint: `https://${"a".repeat(2041)}` })],
    ["no keys", browserSubscription({ keys: undefined })],
    ["keys that aren't an object", browserSubscription({ keys: "keys" })],
    ["an empty p256dh", browserSubscription({ keys: { p256dh: "", auth: "auth-secret" } })],
    ["an empty auth", browserSubscription({ keys: { p256dh: "p256dh-key", auth: "" } })],
    ["a key over 512 characters", browserSubscription({ keys: { p256dh: "k".repeat(513), auth: "auth-secret" } })],
    ["a key that isn't a string", browserSubscription({ keys: { p256dh: 42, auth: "auth-secret" } })],
  ])("rejects %s", (_, value) => {
    expect(parsePushSubscription(value)).toBeNull();
  });

  it("accepts the longest endpoint and keys it allows", () => {
    const endpoint = `https://${"a".repeat(2040)}`;
    expect(parsePushSubscription(browserSubscription({ endpoint, keys: { p256dh: "k".repeat(512), auth: "a" } }))).not.toBeNull();
  });
});

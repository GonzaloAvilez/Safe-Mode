import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveIdentityMock, rateLimitedMock, saveMock, removeMock } = vi.hoisted(() => ({
  resolveIdentityMock: vi.fn(),
  rateLimitedMock: vi.fn(),
  saveMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@/lib/identity-keys", () => ({ resolveIdentityFromReturnKey: resolveIdentityMock }));
vi.mock("@/lib/rate-limit", () => ({ isNotificationSubscriptionRateLimited: rateLimitedMock }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/notifications/push-subscriptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/push-subscriptions")>()),
  savePushSubscription: saveMock,
  removePushSubscription: removeMock,
}));

const { POST, DELETE } = await import("@/app/api/notifications/subscription/route");

const SEAL = "482133901756229";
const IDENTITY = "identity-1";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const SUBSCRIPTION = { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "p256dh-key", auth: "auth-secret" } };

function call(handler: typeof POST, body: unknown, authorization: string | null = `Bearer ${SEAL}`) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return handler(
    new Request("http://localhost/api/notifications/subscription", {
      method: handler === POST ? "POST" : "DELETE",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  rateLimitedMock.mockResolvedValue(false);
  resolveIdentityMock.mockResolvedValue(IDENTITY);
  saveMock.mockResolvedValue(undefined);
  removeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/subscription", () => {
  it("links this device to the seal's identity, in the route's locale", async () => {
    const response = await call(POST, { subscription: SUBSCRIPTION, locale: "es" });

    expect(response.status).toBe(204);
    expect(resolveIdentityMock).toHaveBeenCalledWith(SEAL);
    expect(saveMock).toHaveBeenCalledWith(IDENTITY, { endpoint: ENDPOINT, p256dh: "p256dh-key", auth: "auth-secret" }, "es");
  });

  it("answers 429 when rate limited, before reading the seal", async () => {
    rateLimitedMock.mockResolvedValueOnce(true);

    expect((await call(POST, { subscription: SUBSCRIPTION, locale: "es" })).status).toBe(429);
    expect(resolveIdentityMock).not.toHaveBeenCalled();
  });

  it("answers 401 without a seal", async () => {
    expect((await call(POST, { subscription: SUBSCRIPTION, locale: "es" }, null)).status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("answers 401 for a seal that doesn't belong to anyone", async () => {
    resolveIdentityMock.mockResolvedValueOnce(null);

    expect((await call(POST, { subscription: SUBSCRIPTION, locale: "es" })).status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that isn't JSON", "{not json"],
    ["a body that isn't an object", "42"],
    ["no subscription", { locale: "es" }],
    ["an http endpoint", { subscription: { ...SUBSCRIPTION, endpoint: "http://push.example/1" }, locale: "es" }],
    ["no keys", { subscription: { endpoint: ENDPOINT }, locale: "es" }],
    ["no locale", { subscription: SUBSCRIPTION }],
    ["an unsupported locale", { subscription: SUBSCRIPTION, locale: "fr" }],
  ])("answers 400 for %s, without looking the seal up", async (_, body) => {
    const response = await call(POST, body);

    expect(response.status).toBe(400);
    expect(resolveIdentityMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/notifications/subscription", () => {
  // Another identity on the same device keeps its notices: only this pair is removed.
  it("removes only this identity's row on this device", async () => {
    const response = await call(DELETE, { endpoint: ENDPOINT });

    expect(response.status).toBe(204);
    expect(removeMock).toHaveBeenCalledWith(IDENTITY, ENDPOINT);
  });

  it("answers 401 without a seal: opting out without it is the browser's permission", async () => {
    expect((await call(DELETE, { endpoint: ENDPOINT }, null)).status).toBe(401);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("answers 401 for a seal that doesn't belong to anyone", async () => {
    resolveIdentityMock.mockResolvedValueOnce(null);

    expect((await call(DELETE, { endpoint: ENDPOINT })).status).toBe(401);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("answers 429 when rate limited", async () => {
    rateLimitedMock.mockResolvedValueOnce(true);

    expect((await call(DELETE, { endpoint: ENDPOINT })).status).toBe(429);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no endpoint", {}],
    ["an empty endpoint", { endpoint: "" }],
    ["an endpoint that isn't a string", { endpoint: 7 }],
  ])("answers 400 for %s", async (_, body) => {
    expect((await call(DELETE, body)).status).toBe(400);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

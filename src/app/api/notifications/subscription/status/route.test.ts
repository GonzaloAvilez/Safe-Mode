import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveIdentityMock, rateLimitedMock, isSubscribedMock } = vi.hoisted(() => ({
  resolveIdentityMock: vi.fn(),
  rateLimitedMock: vi.fn(),
  isSubscribedMock: vi.fn(),
}));

vi.mock("@/lib/identity-keys", () => ({ resolveIdentityFromReturnKey: resolveIdentityMock }));
vi.mock("@/lib/rate-limit", () => ({ isNotificationSubscriptionRateLimited: rateLimitedMock }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/notifications/push-subscriptions", () => ({ isPushSubscribed: isSubscribedMock }));

const { POST } = await import("@/app/api/notifications/subscription/status/route");

const SEAL = "482133901756229";
const IDENTITY = "identity-1";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";

function call(body: unknown, authorization: string | null = `Bearer ${SEAL}`) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return POST(
    new Request("http://localhost/api/notifications/subscription/status", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  rateLimitedMock.mockResolvedValue(false);
  resolveIdentityMock.mockResolvedValue(IDENTITY);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/subscription/status", () => {
  it.each([true, false])("answers whether this identity asked for notices on this device (%s)", async (subscribed) => {
    isSubscribedMock.mockResolvedValueOnce(subscribed);

    const response = await call({ endpoint: ENDPOINT });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ subscribed });
    expect(resolveIdentityMock).toHaveBeenCalledWith(SEAL);
    expect(isSubscribedMock).toHaveBeenCalledWith(IDENTITY, ENDPOINT);
  });

  it("answers 429 when rate limited, before reading the seal", async () => {
    rateLimitedMock.mockResolvedValueOnce(true);

    expect((await call({ endpoint: ENDPOINT })).status).toBe(429);
    expect(resolveIdentityMock).not.toHaveBeenCalled();
  });

  it("answers 401 without a seal", async () => {
    expect((await call({ endpoint: ENDPOINT }, null)).status).toBe(401);
    expect(isSubscribedMock).not.toHaveBeenCalled();
  });

  it("answers 401 for a seal that doesn't belong to anyone", async () => {
    resolveIdentityMock.mockResolvedValueOnce(null);

    expect((await call({ endpoint: ENDPOINT })).status).toBe(401);
    expect(isSubscribedMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that isn't JSON", "{not json"],
    ["no endpoint", {}],
    ["an empty endpoint", { endpoint: "" }],
    ["an endpoint that isn't a string", { endpoint: 7 }],
  ])("answers 400 for %s, without looking the seal up", async (_, body) => {
    expect((await call(body)).status).toBe(400);
    expect(resolveIdentityMock).not.toHaveBeenCalled();
    expect(isSubscribedMock).not.toHaveBeenCalled();
  });
});

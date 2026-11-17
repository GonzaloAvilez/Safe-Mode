import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { confirmReturnKeyMock, isReturnKeyConfirmRateLimitedMock } = vi.hoisted(() => ({
  confirmReturnKeyMock: vi.fn(),
  isReturnKeyConfirmRateLimitedMock: vi.fn(),
}));

vi.mock("@/lib/identity-keys", () => ({ confirmReturnKey: confirmReturnKeyMock }));
vi.mock("@/lib/rate-limit", () => ({ isReturnKeyConfirmRateLimited: isReturnKeyConfirmRateLimitedMock }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));

const { POST } = await import("@/app/api/return-key/confirm/route");

const SEAL = "48213 39017 56229";

function confirm(authorization: string | null = `Bearer ${SEAL}`) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return POST(new Request("http://localhost/api/return-key/confirm", { method: "POST", headers }));
}

beforeEach(() => {
  isReturnKeyConfirmRateLimitedMock.mockResolvedValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/return-key/confirm", () => {
  it("confirms the key from the Authorization header and answers 204 with no body", async () => {
    confirmReturnKeyMock.mockResolvedValueOnce(true);

    const response = await confirm();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(confirmReturnKeyMock).toHaveBeenCalledWith(SEAL);
    expect(isReturnKeyConfirmRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
  });

  it("answers 401 for a key that isn't recognized", async () => {
    confirmReturnKeyMock.mockResolvedValueOnce(false);

    const response = await confirm();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "return key not recognized" });
  });

  it.each([
    ["no Authorization header", null],
    ["another auth scheme", `Basic ${SEAL}`],
  ])("answers 401 and confirms nothing with %s", async (_label, authorization) => {
    const response = await confirm(authorization);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "return key required" });
    expect(confirmReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 429 and confirms nothing when rate limited", async () => {
    isReturnKeyConfirmRateLimitedMock.mockResolvedValueOnce(true);

    expect((await confirm()).status).toBe(429);
    expect(confirmReturnKeyMock).not.toHaveBeenCalled();
  });
});

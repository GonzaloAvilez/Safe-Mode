import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, setMock, cookiesMock } = vi.hoisted(() => {
  const getMock = vi.fn();
  const setMock = vi.fn();
  return {
    getMock,
    setMock,
    cookiesMock: vi.fn().mockResolvedValue({ get: getMock, set: setMock }),
  };
});

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

const { getOrCreateSessionId } = await import("@/lib/session");

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.SESSION_SECRET;
});

describe("getOrCreateSessionId", () => {
  it("issues a new session and sets a signed cookie when none exists", async () => {
    getMock.mockReturnValueOnce(undefined);

    const sessionId = await getOrCreateSessionId();

    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(setMock).toHaveBeenCalledTimes(1);

    const [cookieName, cookieValue, options] = setMock.mock.calls[0];
    expect(cookieName).toBe("sm_session");
    const [cookieSessionId, signature] = cookieValue.split(".");
    expect(cookieSessionId).toBe(sessionId);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
  });

  it("returns the same session id across two fresh calls, signed consistently", async () => {
    getMock.mockReturnValue(undefined);

    await getOrCreateSessionId();
    const [, firstValue] = setMock.mock.calls[0];

    getMock.mockReturnValueOnce({ value: firstValue });
    const sessionId = await getOrCreateSessionId();

    expect(sessionId).toBe(firstValue.split(".")[0]);
    expect(setMock).toHaveBeenCalledTimes(1); // not called again — the existing cookie was valid
  });

  it("issues a fresh session when the cookie signature has been tampered with", async () => {
    getMock.mockReturnValueOnce({ value: "some-uuid.tampered-signature" });

    const sessionId = await getOrCreateSessionId();

    expect(sessionId).not.toBe("some-uuid");
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it("issues a fresh session when the cookie value is malformed", async () => {
    getMock.mockReturnValueOnce({ value: "not-a-signed-value" });

    await getOrCreateSessionId();

    expect(setMock).toHaveBeenCalledTimes(1);
  });
});

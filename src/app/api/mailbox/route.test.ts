import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMailboxWithReturnKeyMock, isMailboxRateLimitedMock } = vi.hoisted(() => ({
  getMailboxWithReturnKeyMock: vi.fn(),
  isMailboxRateLimitedMock: vi.fn(),
}));

vi.mock("@/lib/mailbox", () => ({ getMailboxWithReturnKey: getMailboxWithReturnKeyMock }));
vi.mock("@/lib/rate-limit", () => ({ isMailboxRateLimited: isMailboxRateLimitedMock }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));

const { GET } = await import("@/app/api/mailbox/route");

const KEY = "Zx9_k2Lm-Qw8Rt5Yu1Io3Pa7Sd4Fg6Hj0Kl2Zx9Cv5B";
const MAILBOX = {
  correspondences: [
    {
      id: "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70",
      yourSide: "author",
      state: "your_turn",
      phraseText: "A veces basta con que alguien lo lea.",
      letters: [
        {
          sender: "visitor",
          status: "delivered",
          body: "Gracias por tu frase.",
          createdAt: "2026-11-10T10:00:00.000Z",
          deliveredAt: "2026-11-11T09:00:00.000Z",
        },
      ],
    },
  ],
};

function open(authorization: string | null = `Bearer ${KEY}`) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return GET(new Request("http://localhost/api/mailbox", { headers }));
}

beforeEach(() => {
  isMailboxRateLimitedMock.mockResolvedValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mailbox", () => {
  it("answers 200 with the mailbox of the key in the Authorization header", async () => {
    getMailboxWithReturnKeyMock.mockResolvedValueOnce(MAILBOX);

    const response = await open();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(MAILBOX);
    expect(getMailboxWithReturnKeyMock).toHaveBeenCalledWith(KEY);
  });

  it("answers 200 with an empty list for a valid key with nothing to show yet", async () => {
    getMailboxWithReturnKeyMock.mockResolvedValueOnce({ correspondences: [] });

    const response = await open();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ correspondences: [] });
  });

  it("tells caches never to store the letters", async () => {
    getMailboxWithReturnKeyMock.mockResolvedValueOnce(MAILBOX);

    expect((await open()).headers.get("cache-control")).toBe("no-store");
  });

  it("answers 401 for a key that doesn't belong to anyone", async () => {
    getMailboxWithReturnKeyMock.mockResolvedValueOnce(null);

    const response = await open();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "return key not recognized" });
  });

  it.each([
    ["no Authorization header", null],
    ["another auth scheme", `Basic ${KEY}`],
  ])("answers 401 and reads nothing with %s", async (_label, authorization) => {
    const response = await open(authorization);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "return key required" });
    expect(getMailboxWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 429 and reads nothing when rate limited, by IP and session", async () => {
    isMailboxRateLimitedMock.mockResolvedValueOnce(true);

    expect((await open()).status).toBe(429);
    expect(isMailboxRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
    expect(getMailboxWithReturnKeyMock).not.toHaveBeenCalled();
  });
});

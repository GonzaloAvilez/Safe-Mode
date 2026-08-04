import { afterEach, describe, expect, it, vi } from "vitest";

const { isRateLimitedMock, isSuspectedBotMock, logRequestOutcomeMock } = vi.hoisted(() => ({
  isRateLimitedMock: vi.fn(),
  isSuspectedBotMock: vi.fn(),
  logRequestOutcomeMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/bot-protection", () => ({
  isSuspectedBot: isSuspectedBotMock,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

const { rateLimitGuard, botGuard, textLengthGuard } = await import("@/lib/public-submission-guards");

afterEach(() => {
  vi.clearAllMocks();
});

describe("rateLimitGuard", () => {
  it("returns null when neither the IP nor the session is rate limited", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const result = await rateLimitGuard("203.0.113.10", "session-1");

    expect(result).toBeNull();
    expect(isRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
    expect(logRequestOutcomeMock).not.toHaveBeenCalled();
  });

  it("returns a 429 response and logs rate_limited when blocked", async () => {
    isRateLimitedMock.mockResolvedValueOnce(true);

    const result = await rateLimitGuard("203.0.113.10", "session-1");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(await result!.json()).toEqual({ error: "too many requests" });
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limited");
  });
});

describe("botGuard", () => {
  it("returns null when the submission isn't suspected as a bot", () => {
    isSuspectedBotMock.mockReturnValueOnce(false);

    const result = botGuard("203.0.113.10", "", Date.now() - 5000);

    expect(result).toBeNull();
    expect(logRequestOutcomeMock).not.toHaveBeenCalled();
  });

  it("returns a 429 response and logs bot_suspected when flagged", () => {
    isSuspectedBotMock.mockReturnValueOnce(true);

    const result = botGuard("203.0.113.10", "http://spam.example", Date.now() - 5000);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "bot_suspected");
  });

  it("forwards honeypot and formRenderedAt through to isSuspectedBot unchanged", () => {
    isSuspectedBotMock.mockReturnValueOnce(false);
    const formRenderedAt = Date.now() - 5000;

    botGuard("203.0.113.10", "trap-value", formRenderedAt);

    expect(isSuspectedBotMock).toHaveBeenCalledWith({ honeypot: "trap-value", formRenderedAt });
  });
});

describe("textLengthGuard", () => {
  it("returns null for text within the max length", () => {
    expect(textLengthGuard("a real reflection", 800)).toBeNull();
  });

  it("returns a 400 response for missing text", () => {
    const result = textLengthGuard(undefined, 800);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("returns a 400 response for non-string text", () => {
    const result = textLengthGuard(42, 800);

    expect(result!.status).toBe(400);
  });

  it("returns a 400 response for empty or whitespace-only text", () => {
    expect(textLengthGuard("", 800)?.status).toBe(400);
    expect(textLengthGuard("   ", 800)?.status).toBe(400);
  });

  it("returns a 400 response, with the max length in the message, when text exceeds it", async () => {
    const result = textLengthGuard("a".repeat(401), 400);

    expect(result!.status).toBe(400);
    expect(await result!.json()).toEqual({ error: "text is required and must be 400 characters or fewer" });
  });

  it("accepts text exactly at the max length", () => {
    expect(textLengthGuard("a".repeat(400), 400)).toBeNull();
  });
});

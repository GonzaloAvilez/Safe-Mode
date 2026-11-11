import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitAllowedFixture, rateLimitBlockedFixture } from "@/test/fixtures/upstash-responses";

const { limitMock, slidingWindowMock, fromEnvMock, MockRatelimit, logRequestOutcomeMock, constructorConfigs, slidingWindowArgs } =
  vi.hoisted(() => {
    const limitMock = vi.fn();
    const constructorConfigs: Array<{ prefix?: string }> = [];
    // Every limiter is built once, at import time; afterEach's clearAllMocks then wipes
    // slidingWindow's call history, so its arguments are also kept here for later tests.
    const slidingWindowArgs: unknown[][] = [];

    class MockRatelimit {
      limit = limitMock;
      constructor(config: { prefix?: string }) {
        constructorConfigs.push(config);
      }
      static slidingWindow = vi.fn((...args: unknown[]) => {
        slidingWindowArgs.push(args);
        return "sliding-window-config";
      });
    }

    return {
      limitMock,
      slidingWindowMock: MockRatelimit.slidingWindow,
      fromEnvMock: vi.fn().mockReturnValue("redis-client"),
      MockRatelimit,
      logRequestOutcomeMock: vi.fn(),
      constructorConfigs,
      slidingWindowArgs,
    };
  });

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: fromEnvMock },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: MockRatelimit,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

const { isRateLimited, isResonateRateLimited, isLetterRateLimited } = await import("@/lib/rate-limit");

const identifiers = { ip: "203.0.113.10", sessionId: "session-1" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("isRateLimited", () => {
  it("configures the sliding window at 10 requests per 60 seconds", () => {
    expect(slidingWindowMock).toHaveBeenCalledWith(10, "60 s");
  });

  it("returns false when neither the IP nor the session has hit the window", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture).mockResolvedValueOnce(rateLimitAllowedFixture);

    const result = await isRateLimited(identifiers);

    expect(result).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("ip:203.0.113.10");
    expect(limitMock).toHaveBeenCalledWith("session:session-1");
  });

  it("returns true when the IP has exceeded the window, even if the session hasn't", async () => {
    limitMock.mockResolvedValueOnce(rateLimitBlockedFixture).mockResolvedValueOnce(rateLimitAllowedFixture);

    const result = await isRateLimited(identifiers);

    expect(result).toBe(true);
  });

  it("returns true when the session has exceeded the window, even if the IP hasn't", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture).mockResolvedValueOnce(rateLimitBlockedFixture);

    const result = await isRateLimited(identifiers);

    expect(result).toBe(true);
  });

  it("fails open when Upstash is unreachable, so entry submission never depends on it", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await isRateLimited(identifiers);

    expect(result).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("logs a rate_limit_unavailable outcome (keyed by IP) when Upstash is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    await isRateLimited(identifiers);

    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limit_unavailable");
  });
});

describe("isResonateRateLimited", () => {
  it("uses its own Ratelimit instance with a distinct prefix from entries", () => {
    expect(constructorConfigs).toContainEqual(expect.objectContaining({ prefix: "ratelimit:entries" }));
    expect(constructorConfigs).toContainEqual(expect.objectContaining({ prefix: "ratelimit:resonate" }));
  });

  it("returns false when neither the IP nor the session has hit the window", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture).mockResolvedValueOnce(rateLimitAllowedFixture);

    const result = await isResonateRateLimited(identifiers);

    expect(result).toBe(false);
  });

  it("returns true when either the IP or the session has exceeded the window", async () => {
    limitMock.mockResolvedValueOnce(rateLimitBlockedFixture).mockResolvedValueOnce(rateLimitAllowedFixture);

    const result = await isResonateRateLimited(identifiers);

    expect(result).toBe(true);
  });

  it("fails open when Upstash is unreachable", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await isResonateRateLimited(identifiers);

    expect(result).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});

describe("isLetterRateLimited", () => {
  it("uses its own Ratelimit instance at 3 letters per 10 minutes", () => {
    expect(constructorConfigs).toContainEqual(expect.objectContaining({ prefix: "ratelimit:letters" }));
    expect(slidingWindowArgs).toContainEqual([3, "10 m"]);
  });

  it("limits by IP and by session independently", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture).mockResolvedValueOnce(rateLimitAllowedFixture);

    expect(await isLetterRateLimited(identifiers)).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("ip:203.0.113.10");
    expect(limitMock).toHaveBeenCalledWith("session:session-1");
  });

  it("returns true when either the IP or the session has exceeded the window", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture).mockResolvedValueOnce(rateLimitBlockedFixture);

    expect(await isLetterRateLimited(identifiers)).toBe(true);
  });

  it("fails open when Upstash is unreachable", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    expect(await isLetterRateLimited(identifiers)).toBe(false);
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limit_unavailable");
    consoleErrorSpy.mockRestore();
  });
});

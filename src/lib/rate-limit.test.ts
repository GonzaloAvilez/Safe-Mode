import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitAllowedFixture, rateLimitBlockedFixture } from "@/test/fixtures/upstash-responses";

const { limitMock, slidingWindowMock, fromEnvMock, MockRatelimit, logRequestOutcomeMock } = vi.hoisted(
  () => {
    const limitMock = vi.fn();

    class MockRatelimit {
      limit = limitMock;
      static slidingWindow = vi.fn().mockReturnValue("sliding-window-config");
    }

    return {
      limitMock,
      slidingWindowMock: MockRatelimit.slidingWindow,
      fromEnvMock: vi.fn().mockReturnValue("redis-client"),
      MockRatelimit,
      logRequestOutcomeMock: vi.fn(),
    };
  }
);

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: fromEnvMock },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: MockRatelimit,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

const { isRateLimited } = await import("@/lib/rate-limit");

afterEach(() => {
  vi.clearAllMocks();
});

describe("isRateLimited", () => {
  it("configures the sliding window at 10 requests per 60 seconds", () => {
    expect(slidingWindowMock).toHaveBeenCalledWith(10, "60 s");
  });

  it("returns false when the sliding window still has room for this IP", async () => {
    limitMock.mockResolvedValueOnce(rateLimitAllowedFixture);

    const result = await isRateLimited("203.0.113.10");

    expect(result).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("203.0.113.10");
  });

  it("returns true once the IP has exceeded the sliding window", async () => {
    limitMock.mockResolvedValueOnce(rateLimitBlockedFixture);

    const result = await isRateLimited("203.0.113.10");

    expect(result).toBe(true);
  });

  it("fails open when Upstash is unreachable, so entry submission never depends on it", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await isRateLimited("203.0.113.10");

    expect(result).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("logs a rate_limit_unavailable outcome when Upstash is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValueOnce(new Error("fetch failed"));

    await isRateLimited("203.0.113.10");

    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limit_unavailable");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { logRequestOutcome } from "@/lib/logging";

function loggedPayload(consoleLogSpy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logRequestOutcome", () => {
  it("logs an ISO timestamp and the given outcome", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logRequestOutcome("203.0.113.10", "matched");

    const payload = loggedPayload(consoleLogSpy);
    expect(payload.outcome).toBe("matched");
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("hashes the IP instead of logging it raw", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logRequestOutcome("203.0.113.10", "rate_limited");

    const payload = loggedPayload(consoleLogSpy);
    expect(payload.ipHash).not.toBe("203.0.113.10");
    expect(payload.ipHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashes the same IP identically across calls", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logRequestOutcome("203.0.113.10", "no_match");
    logRequestOutcome("203.0.113.10", "no_match");

    const [first, second] = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(first.ipHash).toBe(second.ipHash);
  });

  it("hashes different IPs differently", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logRequestOutcome("203.0.113.10", "no_match");
    logRequestOutcome("198.51.100.20", "no_match");

    const [first, second] = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(first.ipHash).not.toBe(second.ipHash);
  });

  it("never includes entry text in the payload keys", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logRequestOutcome("203.0.113.10", "crisis");

    const payload = loggedPayload(consoleLogSpy);
    expect(Object.keys(payload).sort()).toEqual(["ipHash", "outcome", "timestamp"]);
  });
});

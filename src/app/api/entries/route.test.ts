import { afterEach, describe, expect, it, vi } from "vitest";

const { isRateLimitedMock, submitEntryMock, logRequestOutcomeMock, getOrCreateSessionIdMock } = vi.hoisted(
  () => ({
    isRateLimitedMock: vi.fn(),
    submitEntryMock: vi.fn(),
    logRequestOutcomeMock: vi.fn(),
    getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
  })
);

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/entries", () => ({
  submitEntry: submitEntryMock,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

vi.mock("@/lib/session", () => ({
  getOrCreateSessionId: getOrCreateSessionIdMock,
}));

const { POST } = await import("@/app/api/entries/route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/entries", () => {
  it("returns 429 and never calls submitEntry when the IP or session is rate limited", async () => {
    isRateLimitedMock.mockResolvedValueOnce(true);

    const response = await POST(postRequest({ text: "hola" }));

    expect(response.status).toBe(429);
    expect(isRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
    expect(submitEntryMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limited");
  });

  it("returns 400 when text is missing", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(submitEntryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when text exceeds the max length", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ text: "a".repeat(801) }));

    expect(response.status).toBe(400);
  });

  it("returns 200 with the submitEntry outcome when allowed, forwarding the session id", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);
    submitEntryMock.mockResolvedValueOnce({ type: "no_match", entryId: "entry-1" });

    const response = await POST(postRequest({ text: "un dia normal" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ type: "no_match", entryId: "entry-1" });
    expect(submitEntryMock).toHaveBeenCalledWith("un dia normal", "session-1", undefined);
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "no_match");
  });
});

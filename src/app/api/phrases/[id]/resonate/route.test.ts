import { afterEach, describe, expect, it, vi } from "vitest";

const { isResonateRateLimitedMock, recordResonanceMock, getOrCreateSessionIdMock } = vi.hoisted(() => ({
  isResonateRateLimitedMock: vi.fn(),
  recordResonanceMock: vi.fn(),
  getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
}));

vi.mock("@/lib/rate-limit", () => ({
  isResonateRateLimited: isResonateRateLimitedMock,
}));

vi.mock("@/lib/phrase-resonances", () => ({
  recordResonance: recordResonanceMock,
}));

vi.mock("@/lib/session", () => ({
  getOrCreateSessionId: getOrCreateSessionIdMock,
}));

const { POST } = await import("@/app/api/phrases/[id]/resonate/route");

function postRequest(): Request {
  return new Request("http://localhost/api/phrases/phrase-1/resonate", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/phrases/[id]/resonate", () => {
  it("returns 429 and never records a resonance when rate limited", async () => {
    isResonateRateLimitedMock.mockResolvedValueOnce(true);

    const response = await POST(postRequest(), ctx("phrase-1"));

    expect(response.status).toBe(429);
    expect(isResonateRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
    expect(recordResonanceMock).not.toHaveBeenCalled();
  });

  it("records the resonance with the phrase id and session id when allowed", async () => {
    isResonateRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest(), ctx("phrase-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(recordResonanceMock).toHaveBeenCalledWith("phrase-1", "session-1");
  });
});

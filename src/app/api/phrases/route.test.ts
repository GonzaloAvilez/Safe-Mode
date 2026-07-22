import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  isRateLimitedMock,
  submitUserPhraseMock,
  finalizeUserPhraseModerationMock,
  logRequestOutcomeMock,
  getOrCreateSessionIdMock,
  afterMock,
} = vi.hoisted(() => ({
  isRateLimitedMock: vi.fn(),
  submitUserPhraseMock: vi.fn(),
  finalizeUserPhraseModerationMock: vi.fn(),
  logRequestOutcomeMock: vi.fn(),
  getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
  afterMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/phrases", () => ({
  submitUserPhrase: submitUserPhraseMock,
  finalizeUserPhraseModeration: finalizeUserPhraseModerationMock,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

vi.mock("@/lib/session", () => ({
  getOrCreateSessionId: getOrCreateSessionIdMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

const { POST } = await import("@/app/api/phrases/route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/phrases", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/phrases", () => {
  it("returns 429 and never calls submitUserPhrase when the IP or session is rate limited", async () => {
    isRateLimitedMock.mockResolvedValueOnce(true);

    const response = await POST(postRequest({ text: "hola" }));

    expect(response.status).toBe(429);
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "rate_limited");
  });

  it("returns 429 and never calls submitUserPhrase when the honeypot field is filled", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(
      postRequest({ text: "hola", honeypot: "http://spam.example", formRenderedAt: Date.now() - 5000 })
    );

    expect(response.status).toBe(429);
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "bot_suspected");
  });

  it("returns 429 and never calls submitUserPhrase when submitted faster than a human could type", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ text: "hola", honeypot: "", formRenderedAt: Date.now() - 100 }));

    expect(response.status).toBe(429);
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "bot_suspected");
  });

  it("returns 400 when text is missing", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ formRenderedAt: Date.now() - 5000 }));

    expect(response.status).toBe(400);
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
  });

  it("returns 400 when text exceeds the max length", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ text: "a".repeat(121), formRenderedAt: Date.now() - 5000 }));

    expect(response.status).toBe(400);
  });

  it("returns 200 and schedules moderation when allowed", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);
    submitUserPhraseMock.mockResolvedValueOnce({ id: "phrase-1" });

    const response = await POST(postRequest({ text: "un dia normal", formRenderedAt: Date.now() - 5000, origin: LEAVE_A_TRACE_ORIGIN }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(submitUserPhraseMock).toHaveBeenCalledWith("un dia normal", "leave_a_trace");
    expect(afterMock).toHaveBeenCalledWith(expect.any(Function));
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "phrase_submitted");
  });
});

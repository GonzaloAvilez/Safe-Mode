import { afterEach, describe, expect, it, vi } from "vitest";

const { isRateLimitedMock, submitEntryMock, logRequestOutcomeMock, getOrCreateSessionIdMock, isPhraseConnectableNowMock } =
  vi.hoisted(() => ({
    isRateLimitedMock: vi.fn(),
    submitEntryMock: vi.fn(),
    logRequestOutcomeMock: vi.fn(),
    getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
    isPhraseConnectableNowMock: vi.fn(),
  }));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/entries", () => ({
  submitEntry: submitEntryMock,
}));

vi.mock("@/lib/correspondences", () => ({
  isPhraseConnectableNow: isPhraseConnectableNowMock,
}));

vi.mock("@/lib/logging", () => ({
  logRequestOutcome: logRequestOutcomeMock,
}));

vi.mock("@/lib/session", () => ({
  getOrCreateSessionId: getOrCreateSessionIdMock,
}));

// public-submission-guards.ts imports settings.ts for lettersOpenGuard, which this route
// doesn't use; this stops it from building a real Supabase client at load time.
vi.mock("@/lib/settings", () => ({ isLettersOpen: vi.fn() }));

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

    const response = await POST(postRequest({ formRenderedAt: Date.now() - 5000 }));

    expect(response.status).toBe(400);
    expect(submitEntryMock).not.toHaveBeenCalled();
  });

  it("returns 429 and never calls submitEntry when the honeypot field is filled", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(
      postRequest({ text: "hola", honeypot: "http://spam.example", formRenderedAt: Date.now() - 5000 })
    );

    expect(response.status).toBe(429);
    expect(submitEntryMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "bot_suspected");
  });

  it("returns 429 and never calls submitEntry when submitted faster than a human could type", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ text: "hola", honeypot: "", formRenderedAt: Date.now() - 100 }));

    expect(response.status).toBe(429);
    expect(submitEntryMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "bot_suspected");
  });

  it("returns 400 when text exceeds the max length", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRequest({ text: "a".repeat(801), formRenderedAt: Date.now() - 5000 }));

    expect(response.status).toBe(400);
  });

  it("defaults legacy requests without locale to English", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);
    submitEntryMock.mockResolvedValueOnce({ type: "no_match", entryId: "entry-1" });

    const response = await POST(postRequest({ text: "un dia normal", formRenderedAt: Date.now() - 5000 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ type: "no_match", entryId: "entry-1" });
    expect(submitEntryMock).toHaveBeenCalledWith("un dia normal", "session-1", undefined, "en");
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "no_match");
  });

  it("forwards a supported locale and rejects an unsupported one", async () => {
    isRateLimitedMock.mockResolvedValue(false);
    submitEntryMock.mockResolvedValue({ type: "no_match", entryId: "entry-1" });

    const spanish = await POST(
      postRequest({ text: "un día normal", formRenderedAt: Date.now() - 5000, locale: "es" })
    );
    const unsupported = await POST(
      postRequest({ text: "un jour normal", formRenderedAt: Date.now() - 5000, locale: "fr" })
    );

    expect(spanish.status).toBe(200);
    expect(submitEntryMock).toHaveBeenCalledWith("un día normal", "session-1", undefined, "es");
    expect(unsupported.status).toBe(400);
    expect(submitEntryMock).toHaveBeenCalledTimes(1);
  });

  describe("a matched entry says whether Mirror may offer a letter (ADR-004 #212)", () => {
    const MATCHED = {
      type: "matched",
      entryId: "entry-1",
      phrase: { id: "phrase-1", text: "Hay días en que sonrío para que nadie pregunte.", similarity: 0.71 },
    };

    function submitMatched() {
      isRateLimitedMock.mockResolvedValueOnce(false);
      submitEntryMock.mockResolvedValueOnce(MATCHED);
      return POST(postRequest({ text: "sonrío para que no pregunten", formRenderedAt: Date.now() - 5000, locale: "es" }));
    }

    it.each([true, false])("adds connectable: %s to the matched phrase, keeping the rest as is", async (connectable) => {
      isPhraseConnectableNowMock.mockResolvedValueOnce(connectable);

      const response = await submitMatched();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...MATCHED, phrase: { ...MATCHED.phrase, connectable } });
      expect(isPhraseConnectableNowMock).toHaveBeenCalledWith("phrase-1");
    });

    it("still answers the match, with connectable: false, when that lookup fails", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      isPhraseConnectableNowMock.mockRejectedValueOnce(new Error("connection failure"));

      const response = await submitMatched();

      expect(response.status).toBe(200);
      expect((await response.json()).phrase.connectable).toBe(false);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it.each([
      { type: "no_match", entryId: "entry-1" },
      { type: "crisis", entryId: "entry-1" },
      { type: "cap_reached", entryId: "entry-1" },
    ])("doesn't look anything up for $type", async (outcome) => {
      isRateLimitedMock.mockResolvedValueOnce(false);
      submitEntryMock.mockResolvedValueOnce(outcome);

      const response = await POST(postRequest({ text: "hola", formRenderedAt: Date.now() - 5000 }));

      expect(await response.json()).toEqual(outcome);
      expect(isPhraseConnectableNowMock).not.toHaveBeenCalled();
    });
  });
});

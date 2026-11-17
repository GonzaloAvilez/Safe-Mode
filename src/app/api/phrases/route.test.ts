import { CONTRIBUTE_ORIGIN, LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  isRateLimitedMock,
  submitUserPhraseMock,
  submitUserPhraseAcceptingLettersMock,
  finalizeUserPhraseModerationMock,
  logRequestOutcomeMock,
  getOrCreateSessionIdMock,
  afterMock,
  isLettersOpenMock,
  pickReturnKeySentenceMock,
} = vi.hoisted(() => ({
  isRateLimitedMock: vi.fn(),
  submitUserPhraseMock: vi.fn(),
  submitUserPhraseAcceptingLettersMock: vi.fn(),
  finalizeUserPhraseModerationMock: vi.fn(),
  logRequestOutcomeMock: vi.fn(),
  getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
  afterMock: vi.fn(),
  isLettersOpenMock: vi.fn(),
  pickReturnKeySentenceMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/phrases", () => ({
  submitUserPhrase: submitUserPhraseMock,
  submitUserPhraseAcceptingLetters: submitUserPhraseAcceptingLettersMock,
  finalizeUserPhraseModeration: finalizeUserPhraseModerationMock,
}));

vi.mock("@/lib/return-key-sentences", () => ({
  pickReturnKeySentence: pickReturnKeySentenceMock,
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

vi.mock("@/lib/settings", () => ({ isLettersOpen: isLettersOpenMock }));

const { POST } = await import("@/app/api/phrases/route");

function postRequest(body: unknown): Request {
  return postRawRequest(JSON.stringify(body));
}

function postRawRequest(raw: string): Request {
  return new Request("http://localhost/api/phrases", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: raw,
  });
}

// A Leave a Trace phrase that passes every guard.
const TRACE = { text: "un dia normal", formRenderedAt: Date.now() - 5000, origin: LEAVE_A_TRACE_ORIGIN, locale: "es" };

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

  it("returns 400 when text exceeds the max length, and accepts exactly the max", async () => {
    isRateLimitedMock.mockResolvedValue(false);
    submitUserPhraseMock.mockResolvedValue({ id: "phrase-1" });

    const tooLong = await POST(postRequest({ ...TRACE, text: "a".repeat(401) }));
    const atMax = await POST(postRequest({ ...TRACE, text: "a".repeat(400) }));

    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "text is required and must be 400 characters or fewer" });
    expect(atMax.status).toBe(200);
  });

  it.each([
    ["malformed JSON", "{"],
    ["a null body", "null"],
    ["an array body", JSON.stringify([TRACE])],
  ])("returns 400 (not 500) and saves nothing for %s", async (_label, raw) => {
    isRateLimitedMock.mockResolvedValueOnce(false);

    const response = await POST(postRawRequest(raw));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "body must be a JSON object" });
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
  });

  it("returns 200 and schedules moderation when allowed", async () => {
    isRateLimitedMock.mockResolvedValueOnce(false);
    submitUserPhraseMock.mockResolvedValueOnce({ id: "phrase-1" });

    const response = await POST(postRequest({ text: "un dia normal", formRenderedAt: Date.now() - 5000, origin: LEAVE_A_TRACE_ORIGIN }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(submitUserPhraseMock).toHaveBeenCalledWith("un dia normal", "leave_a_trace", "en");
    expect(afterMock).toHaveBeenCalledWith(expect.any(Function));
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "phrase_submitted");
  });

  it("forwards a supported locale and rejects an unsupported one", async () => {
    isRateLimitedMock.mockResolvedValue(false);
    submitUserPhraseMock.mockResolvedValue({ id: "phrase-1" });

    const spanish = await POST(
      postRequest({
        text: "un día normal",
        formRenderedAt: Date.now() - 5000,
        origin: LEAVE_A_TRACE_ORIGIN,
        locale: "es",
      })
    );
    const unsupported = await POST(
      postRequest({
        text: "un jour normal",
        formRenderedAt: Date.now() - 5000,
        origin: LEAVE_A_TRACE_ORIGIN,
        locale: "fr",
      })
    );

    expect(spanish.status).toBe(200);
    expect(submitUserPhraseMock).toHaveBeenCalledWith("un día normal", "leave_a_trace", "es");
    expect(unsupported.status).toBe(400);
    expect(submitUserPhraseMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/phrases with acceptsLetters (ADR-004 #212)", () => {
  beforeEach(() => {
    isRateLimitedMock.mockResolvedValue(false);
    isLettersOpenMock.mockResolvedValue(true);
    pickReturnKeySentenceMock.mockReturnValue("Lo que dejaste aquí sigue aquí.");
  });

  it("stores the phrase as the author's and hands over the key and its sentence once, never cacheable", async () => {
    submitUserPhraseAcceptingLettersMock.mockResolvedValueOnce({ id: "phrase-1", returnKey: "482133901756229" });

    const response = await POST(postRequest({ ...TRACE, acceptsLetters: true }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      returnKey: "482133901756229",
      returnKeySentence: "Lo que dejaste aquí sigue aquí.",
    });
    expect(submitUserPhraseAcceptingLettersMock).toHaveBeenCalledWith("un dia normal", "es");
    expect(pickReturnKeySentenceMock).toHaveBeenCalledWith("es");
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
    expect(logRequestOutcomeMock).toHaveBeenCalledWith("203.0.113.10", "phrase_submitted");
  });

  it("moderates the phrase after the response, like any other", async () => {
    submitUserPhraseAcceptingLettersMock.mockResolvedValueOnce({ id: "phrase-1", returnKey: "482133901756229" });

    await POST(postRequest({ ...TRACE, acceptsLetters: true }));
    afterMock.mock.calls[0][0]();

    expect(finalizeUserPhraseModerationMock).toHaveBeenCalledWith("phrase-1", "un dia normal");
  });

  it("still saves the phrase, without a key, while letters are closed", async () => {
    isLettersOpenMock.mockResolvedValueOnce(false);
    submitUserPhraseMock.mockResolvedValueOnce({ id: "phrase-1" });

    const response = await POST(postRequest({ ...TRACE, acceptsLetters: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(submitUserPhraseMock).toHaveBeenCalledWith("un dia normal", "leave_a_trace", "es");
    expect(submitUserPhraseAcceptingLettersMock).not.toHaveBeenCalled();
  });

  it.each([
    ["false", false],
    ["absent", undefined],
  ])("saves a phrase without an author when acceptsLetters is %s, without reading the flag", async (_label, acceptsLetters) => {
    submitUserPhraseMock.mockResolvedValueOnce({ id: "phrase-1" });

    const response = await POST(postRequest({ ...TRACE, acceptsLetters }));

    expect(await response.json()).toEqual({ ok: true });
    expect(submitUserPhraseAcceptingLettersMock).not.toHaveBeenCalled();
    expect(isLettersOpenMock).not.toHaveBeenCalled();
  });

  it("refuses letters for a Contribute phrase (OD-3) and saves nothing", async () => {
    const response = await POST(postRequest({ ...TRACE, origin: CONTRIBUTE_ORIGIN, acceptsLetters: true }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "only Leave a Trace phrases can accept letters" });
    expect(submitUserPhraseMock).not.toHaveBeenCalled();
    expect(submitUserPhraseAcceptingLettersMock).not.toHaveBeenCalled();
  });

  it.each([["the string \"true\"", "true"], ["a number", 1], ["null", null]])(
    "returns 400 and saves nothing when acceptsLetters is %s",
    async (_label, acceptsLetters) => {
      const response = await POST(postRequest({ ...TRACE, acceptsLetters }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "acceptsLetters must be a boolean" });
      expect(submitUserPhraseMock).not.toHaveBeenCalled();
      expect(submitUserPhraseAcceptingLettersMock).not.toHaveBeenCalled();
    }
  );
});

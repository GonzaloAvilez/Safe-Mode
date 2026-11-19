import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createVisitorReturnKeyMock, isReturnKeyCreateRateLimitedMock, isLettersOpenMock, pickReturnKeySentenceMock } =
  vi.hoisted(() => ({
    createVisitorReturnKeyMock: vi.fn(),
    isReturnKeyCreateRateLimitedMock: vi.fn(),
    isLettersOpenMock: vi.fn(),
    pickReturnKeySentenceMock: vi.fn(),
  }));

vi.mock("@/lib/correspondences", () => ({ createVisitorReturnKey: createVisitorReturnKeyMock }));
vi.mock("@/lib/settings", () => ({ isLettersOpen: isLettersOpenMock }));
vi.mock("@/lib/rate-limit", () => ({ isReturnKeyCreateRateLimited: isReturnKeyCreateRateLimitedMock, isRateLimited: vi.fn() }));
vi.mock("@/lib/return-key-sentences", () => ({ pickReturnKeySentence: pickReturnKeySentenceMock }));
vi.mock("@/lib/bot-protection", () => ({ isSuspectedBot: vi.fn() }));
vi.mock("@/lib/logging", () => ({ logRequestOutcome: vi.fn() }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));

const { POST } = await import("@/app/api/return-key/route");
const { DEFAULT_LOCALE } = await import("@/lib/locale");

const ENTRY_ID = "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70";
const VALID = { entryId: ENTRY_ID, locale: "es" };

function ask(body: unknown) {
  return askWithRawBody(JSON.stringify(body));
}

function askWithRawBody(raw: string) {
  return POST(new Request("http://localhost/api/return-key", { method: "POST", body: raw }));
}

beforeEach(() => {
  isLettersOpenMock.mockResolvedValue(true);
  isReturnKeyCreateRateLimitedMock.mockResolvedValue(false);
  pickReturnKeySentenceMock.mockImplementation((locale: string) => `sentence-${locale}`);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/return-key", () => {
  it("creates the visitor's seal with a gift sentence in their language, 201 and never cacheable", async () => {
    createVisitorReturnKeyMock.mockResolvedValueOnce({ type: "created", returnKey: "482133901756229" });

    const response = await ask(VALID);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      type: "created",
      returnKey: "482133901756229",
      returnKeySentence: "sentence-es",
    });
    expect(createVisitorReturnKeyMock).toHaveBeenCalledWith({ entryId: ENTRY_ID, sessionId: "session-1" });
    expect(isReturnKeyCreateRateLimitedMock).toHaveBeenCalledWith({ ip: "203.0.113.10", sessionId: "session-1" });
  });

  it("picks the sentence in English for an English visitor", async () => {
    createVisitorReturnKeyMock.mockResolvedValueOnce({ type: "created", returnKey: "482133901756229" });

    const response = await ask({ ...VALID, locale: "en" });

    expect((await response.json()).returnKeySentence).toBe("sentence-en");
  });

  it("falls back to the default language when none is sent", async () => {
    createVisitorReturnKeyMock.mockResolvedValueOnce({ type: "created", returnKey: "482133901756229" });

    const response = await ask({ entryId: ENTRY_ID });

    expect(response.status).toBe(201);
    expect(pickReturnKeySentenceMock).toHaveBeenCalledWith(DEFAULT_LOCALE);
  });

  it.each([
    [{ type: "entry_not_found" }, 404],
    [{ type: "phrase_not_connectable" }, 403],
  ])("maps %j to %s, with no seal and no sentence", async (result, status) => {
    createVisitorReturnKeyMock.mockResolvedValueOnce(result);

    const response = await ask(VALID);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(result);
    expect(pickReturnKeySentenceMock).not.toHaveBeenCalled();
  });

  it("answers 503 and creates nothing while letters are closed, before spending any rate limit", async () => {
    isLettersOpenMock.mockResolvedValueOnce(false);

    const response = await ask(VALID);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "letters are closed" });
    expect(isReturnKeyCreateRateLimitedMock).not.toHaveBeenCalled();
    expect(createVisitorReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 429 and creates nothing when rate limited", async () => {
    isReturnKeyCreateRateLimitedMock.mockResolvedValueOnce(true);

    expect((await ask(VALID)).status).toBe(429);
    expect(createVisitorReturnKeyMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing entryId", { locale: "es" }],
    ["entryId that isn't a uuid", { ...VALID, entryId: "entry-1" }],
    ["entryId that isn't a string", { ...VALID, entryId: 42 }],
    ["an unknown locale", { ...VALID, locale: "fr" }],
  ])("answers 400 and creates nothing for %s", async (_label, body) => {
    expect((await ask(body)).status).toBe(400);
    expect(createVisitorReturnKeyMock).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["a null body", "null"],
    ["an array body", JSON.stringify([VALID])],
  ])("answers 400 (not 500) and creates nothing for %s", async (_label, raw) => {
    const response = await askWithRawBody(raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "body must be a JSON object" });
    expect(createVisitorReturnKeyMock).not.toHaveBeenCalled();
  });
});

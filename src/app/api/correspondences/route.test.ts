import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startCorrespondenceMock, isLetterRateLimitedMock, isSuspectedBotMock } = vi.hoisted(() => ({
  startCorrespondenceMock: vi.fn(),
  isLetterRateLimitedMock: vi.fn(),
  isSuspectedBotMock: vi.fn(),
}));

vi.mock("@/lib/correspondences", () => ({ startCorrespondence: startCorrespondenceMock }));
// letters.ts is loaded for real (the route uses its LETTER_MAX_LENGTH); these stop its
// imports from building real Supabase/OpenAI clients at load time.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/openai", () => ({ moderateText: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isLetterRateLimited: isLetterRateLimitedMock, isRateLimited: vi.fn() }));
vi.mock("@/lib/bot-protection", () => ({ isSuspectedBot: isSuspectedBotMock }));
vi.mock("@/lib/logging", () => ({ logRequestOutcome: vi.fn() }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));

const { POST } = await import("@/app/api/correspondences/route");

const ENTRY_ID = "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70";
const VALID = { entryId: ENTRY_ID, text: "Gracias por tu frase.", honeypot: "", formRenderedAt: 0 };

function start(body: unknown) {
  return startWithRawBody(JSON.stringify(body));
}

function startWithRawBody(raw: string) {
  return POST(new Request("http://localhost/api/correspondences", { method: "POST", body: raw }));
}

beforeEach(() => {
  isLetterRateLimitedMock.mockResolvedValue(false);
  isSuspectedBotMock.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/correspondences", () => {
  it("starts a correspondence and returns the key with 201, never cacheable", async () => {
    const started = { type: "started", correspondenceId: "c1", returnKey: "the-key", letter: { type: "held" } };
    startCorrespondenceMock.mockResolvedValueOnce(started);

    const response = await start(VALID);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(started);
    expect(startCorrespondenceMock).toHaveBeenCalledWith({ entryId: ENTRY_ID, sessionId: "session-1", body: VALID.text });
  });

  it.each([
    [{ type: "entry_not_found" }, 404],
    [{ type: "phrase_not_connectable" }, 403],
  ])("maps %j to %s", async (result, status) => {
    startCorrespondenceMock.mockResolvedValueOnce(result);

    expect((await start(VALID)).status).toBe(status);
  });

  it("answers 429 and starts nothing when rate limited", async () => {
    isLetterRateLimitedMock.mockResolvedValueOnce(true);

    expect((await start(VALID)).status).toBe(429);
    expect(startCorrespondenceMock).not.toHaveBeenCalled();
  });

  it("answers 429 and starts nothing for a suspected bot", async () => {
    isSuspectedBotMock.mockReturnValueOnce(true);

    expect((await start(VALID)).status).toBe(429);
    expect(startCorrespondenceMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty text", { ...VALID, text: "   " }],
    ["text over 1200 characters", { ...VALID, text: "a".repeat(1201) }],
    ["missing entryId", { ...VALID, entryId: undefined }],
    ["entryId that isn't a uuid", { ...VALID, entryId: "entry-1" }],
  ])("answers 400 and starts nothing for %s", async (_label, body) => {
    expect((await start(body)).status).toBe(400);
    expect(startCorrespondenceMock).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["a null body", "null"],
    ["an array body", JSON.stringify([VALID])],
  ])("answers 400 (not 500) and starts nothing for %s", async (_label, raw) => {
    const response = await startWithRawBody(raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "body must be a JSON object" });
    expect(startCorrespondenceMock).not.toHaveBeenCalled();
  });

  it("accepts a letter of exactly 1200 characters", async () => {
    startCorrespondenceMock.mockResolvedValueOnce({ type: "entry_not_found" });

    expect((await start({ ...VALID, text: "a".repeat(1200) })).status).not.toBe(400);
  });
});

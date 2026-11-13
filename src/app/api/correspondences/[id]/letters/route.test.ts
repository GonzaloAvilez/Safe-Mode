import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { submitLetterWithReturnKeyMock, isLetterRateLimitedMock, isSuspectedBotMock } = vi.hoisted(() => ({
  submitLetterWithReturnKeyMock: vi.fn(),
  isLetterRateLimitedMock: vi.fn(),
  isSuspectedBotMock: vi.fn(),
}));

vi.mock("@/lib/correspondences", () => ({ submitLetterWithReturnKey: submitLetterWithReturnKeyMock }));
// letters.ts is loaded for real (the route uses its LETTER_MAX_LENGTH); these stop its
// imports from building real Supabase/OpenAI clients at load time.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/openai", () => ({ moderateText: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isLetterRateLimited: isLetterRateLimitedMock, isRateLimited: vi.fn() }));
vi.mock("@/lib/bot-protection", () => ({ isSuspectedBot: isSuspectedBotMock }));
vi.mock("@/lib/logging", () => ({ logRequestOutcome: vi.fn() }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: vi.fn().mockResolvedValue("session-1") }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn().mockReturnValue("203.0.113.10") }));

const { POST } = await import("@/app/api/correspondences/[id]/letters/route");

const CORRESPONDENCE_ID = "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70";
const KEY = "Zx9_k2Lm-Qw8Rt5Yu1Io3Pa7Sd4Fg6Hj0Kl2Zx9Cv5B";
const VALID = { text: "Gracias por responder.", honeypot: "", formRenderedAt: 0 };

function write({
  body = JSON.stringify(VALID),
  authorization = `Bearer ${KEY}`,
  id = CORRESPONDENCE_ID,
}: { body?: string; authorization?: string | null; id?: string } = {}) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  const request = new Request(`http://localhost/api/correspondences/${id}/letters`, { method: "POST", headers, body });
  return POST(request, { params: Promise.resolve({ id }) } as RouteContext<"/api/correspondences/[id]/letters">);
}

beforeEach(() => {
  isLetterRateLimitedMock.mockResolvedValue(false);
  isSuspectedBotMock.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/correspondences/[id]/letters", () => {
  it("writes the letter with the key from the Authorization header", async () => {
    submitLetterWithReturnKeyMock.mockResolvedValueOnce({ type: "held" });

    const response = await write();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ type: "held" });
    expect(submitLetterWithReturnKeyMock).toHaveBeenCalledWith({
      correspondenceId: CORRESPONDENCE_ID,
      returnKey: KEY,
      body: VALID.text,
    });
  });

  it.each([
    [{ type: "held" }, 201],
    [{ type: "crisis", resourceUrl: "/es/help" }, 201],
    [{ type: "rejected", reason: "moderation" }, 201],
    [{ type: "rejected", reason: "contact_info", contactKinds: ["email"] }, 201],
    [{ type: "not_allowed", reason: "closed" }, 409],
    [{ type: "not_allowed", reason: "awaiting_review" }, 409],
    [{ type: "not_allowed", reason: "not_your_turn" }, 409],
    [{ type: "not_found" }, 404],
  ])("answers %j with %s and passes the outcome through", async (result, status) => {
    submitLetterWithReturnKeyMock.mockResolvedValueOnce(result);

    const response = await write();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(result);
  });

  it.each([
    ["no Authorization header", null],
    ["another auth scheme", `Basic ${KEY}`],
  ])("answers 401 and writes nothing with %s", async (_label, authorization) => {
    const response = await write({ authorization });

    expect(response.status).toBe(401);
    expect(submitLetterWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a path id that isn't a uuid, without querying anything", async () => {
    const response = await write({ id: "correspondence-1" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ type: "not_found" });
    expect(submitLetterWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 429 and writes nothing when rate limited", async () => {
    isLetterRateLimitedMock.mockResolvedValueOnce(true);

    expect((await write()).status).toBe(429);
    expect(submitLetterWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers 429 and writes nothing for a suspected bot", async () => {
    isSuspectedBotMock.mockReturnValueOnce(true);

    expect((await write()).status).toBe(429);
    expect(submitLetterWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["a null body", "null"],
    ["an array body", JSON.stringify([VALID])],
    ["empty text", JSON.stringify({ ...VALID, text: "   " })],
    ["text over 1200 characters", JSON.stringify({ ...VALID, text: "a".repeat(1201) })],
  ])("answers 400 and writes nothing for %s", async (_label, body) => {
    expect((await write({ body })).status).toBe(400);
    expect(submitLetterWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("accepts a letter of exactly 1200 characters", async () => {
    submitLetterWithReturnKeyMock.mockResolvedValueOnce({ type: "held" });

    expect((await write({ body: JSON.stringify({ ...VALID, text: "a".repeat(1200) }) })).status).toBe(201);
  });
});

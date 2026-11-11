import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
  generalFlaggedModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import type { Letter } from "@/lib/letter-lifecycle";

// The database and OpenAI are mocked; the correspondence rules (part B) and the safety
// pipeline are real, so these tests also prove both parts work together.
const { fromMock, moderateTextMock } = vi.hoisted(() => ({ fromMock: vi.fn(), moderateTextMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

const { submitLetter } = await import("@/lib/letters");
const { CRISIS_RESOURCE_URL } = await import("@/lib/safety/crisis-resource");

afterEach(() => {
  vi.clearAllMocks();
});

const CLEAN = benignModerationCheckFixture;
const CRISIS = concerningModerationCheckFixture;
const GENERAL = generalFlaggedModerationCheckFixture;

const CORRESPONDENCE_ID = "correspondence-1";

type Stored = { closed_at: string | null; letters: Letter[] } | null;

// Wires the two tables submitLetter touches. Returns the insert mock to inspect rows.
function mockDatabase({
  stored,
  loadError = null,
  insertError = null,
}: {
  stored: Stored;
  loadError?: unknown;
  insertError?: unknown;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: stored, error: loadError });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ error: insertError });

  fromMock.mockImplementation((table: string) => (table === "correspondences" ? { select } : { insert }));
  return { insert, eq };
}

const open = (...letters: Letter[]): Stored => ({ closed_at: null, letters });
const visitor = (status: Letter["status"]): Letter => ({ sender: "visitor", status });

describe("submitLetter", () => {
  describe.each([
    { language: "ES", honest: "Gracias por tu frase, me acompañó.", withPhone: "Escríbeme al 55 1234 5678" },
    { language: "EN", honest: "Thank you for your words, they stayed with me.", withPhone: "Text me at 555 123 4567" },
  ])("$language", ({ honest, withPhone }) => {
    it("stores an honest letter as held, with its text", async () => {
      const { insert } = mockDatabase({ stored: open() });
      moderateTextMock.mockResolvedValue(CLEAN);

      const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: honest });

      expect(result).toEqual({ type: "held" });
      expect(insert).toHaveBeenCalledWith({
        correspondence_id: CORRESPONDENCE_ID,
        sender: "visitor",
        status: "held",
        body: honest,
      });
    });

    it("stores a contact-info rejection WITHOUT its text, and says what to remove", async () => {
      const { insert } = mockDatabase({ stored: open() });
      moderateTextMock.mockResolvedValue(CLEAN);

      const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: withPhone });

      expect(result).toEqual({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });
      expect(insert).toHaveBeenCalledWith({
        correspondence_id: CORRESPONDENCE_ID,
        sender: "visitor",
        status: "rejected",
        rejection_reason: "contact_info",
        body: null,
      });
    });

    it("answers a crisis letter with the help resource, and keeps its text (30-day retention)", async () => {
      const { insert } = mockDatabase({ stored: open() });
      moderateTextMock.mockResolvedValue(CRISIS);

      const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: withPhone });

      expect(result).toEqual({ type: "crisis", resourceUrl: CRISIS_RESOURCE_URL });
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected", rejection_reason: "crisis", body: withPhone })
      );
    });

    it("stores a general-moderation rejection with its text", async () => {
      const { insert } = mockDatabase({ stored: open() });
      moderateTextMock.mockResolvedValue(GENERAL);

      const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: honest });

      expect(result).toEqual({ type: "rejected", reason: "moderation" });
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected", rejection_reason: "moderation", body: honest })
      );
    });
  });

  it("lets the author reply once the visitor's letter is delivered", async () => {
    const { insert } = mockDatabase({ stored: open(visitor("delivered")) });
    moderateTextMock.mockResolvedValue(CLEAN);

    const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "author", body: "Gracias a ti." });

    expect(result).toEqual({ type: "held" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ sender: "author", status: "held" }));
  });

  it("looks up the correspondence it was given", async () => {
    const { eq } = mockDatabase({ stored: open() });
    moderateTextMock.mockResolvedValue(CLEAN);

    await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: "hola" });

    expect(eq).toHaveBeenCalledWith("id", CORRESPONDENCE_ID);
  });

  // A letter that can't be sent must not cost a moderation call or write anything.
  it.each<[string, Stored, "visitor" | "author", unknown]>([
    ["unknown correspondence", null, "visitor", { type: "not_found" }],
    ["author writing first", open(), "author", { type: "not_allowed", reason: "not_your_turn" }],
    ["visitor sending two in a row", open(visitor("delivered")), "visitor", { type: "not_allowed", reason: "not_your_turn" }],
    ["a letter waiting for review", open(visitor("held")), "visitor", { type: "not_allowed", reason: "awaiting_review" }],
    [
      "a closed correspondence",
      { closed_at: "2026-11-09T00:00:00Z", letters: [] },
      "visitor",
      { type: "not_allowed", reason: "closed" },
    ],
  ])("refuses before moderating: %s", async (_label, stored, sender, expected) => {
    const { insert } = mockDatabase({ stored });

    const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender, body: "hola" });

    expect(result).toEqual(expected);
    expect(moderateTextMock).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  describe("when the insert fails", () => {
    it("answers awaiting_review when it lost the race on the one-held-letter index", async () => {
      mockDatabase({
        stored: open(),
        insertError: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "letters_one_held_per_correspondence"',
        },
      });
      moderateTextMock.mockResolvedValue(CLEAN);

      const result = await submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: "hola" });

      expect(result).toEqual({ type: "not_allowed", reason: "awaiting_review" });
    });

    it.each([
      ["a unique violation on another constraint", { code: "23505", message: 'violates unique constraint "letters_pkey"' }],
      ["a check-constraint violation", { code: "23514", message: 'violates check constraint "letters_body_null_explained"' }],
      ["any other database error", { code: "08006", message: "connection failure" }],
    ])("throws on %s (only the expected race is swallowed)", async (_label, insertError) => {
      mockDatabase({ stored: open(), insertError });
      moderateTextMock.mockResolvedValue(CLEAN);

      await expect(
        submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: "hola" })
      ).rejects.toEqual(insertError);
    });
  });

  it("throws when the correspondence can't be loaded", async () => {
    const loadError = { code: "08006", message: "connection failure" };
    mockDatabase({ stored: null, loadError });

    await expect(
      submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: "hola" })
    ).rejects.toEqual(loadError);
    expect(moderateTextMock).not.toHaveBeenCalled();
  });

  it("stores nothing when moderation fails (fail-closed)", async () => {
    const { insert } = mockDatabase({ stored: open() });
    moderateTextMock.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(
      submitLetter({ correspondenceId: CORRESPONDENCE_ID, sender: "visitor", body: "hola" })
    ).rejects.toThrow("OpenAI unavailable");
    expect(insert).not.toHaveBeenCalled();
  });
});

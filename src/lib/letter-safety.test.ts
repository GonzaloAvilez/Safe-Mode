import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
  directedAggressionModerationCheckFixture,
  generalFlaggedModerationCheckFixture,
  selfHarmOnlyModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import type { ModerationFlags } from "@/lib/safety/moderation-flags";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

const { resolveLetterSafetyOutcome, checkLetterSafety } = await import("@/lib/letter-safety");

afterEach(() => {
  vi.clearAllMocks();
});

const CLEAN = benignModerationCheckFixture;
const CRISIS = concerningModerationCheckFixture;
const GENERAL = generalFlaggedModerationCheckFixture;
const AGGRESSION = directedAggressionModerationCheckFixture;

describe("resolveLetterSafetyOutcome: priority order", () => {
  // Every combination of the three signals: crisis > directed aggression > contact info.
  const NO_CONTACT = { found: false, kinds: [] };
  const CONTACT = { found: true, kinds: ["phone" as const] };

  it.each([
    [true, true, true, { outcome: "rejected", reason: "crisis" }],
    [true, true, false, { outcome: "rejected", reason: "crisis" }],
    [true, false, true, { outcome: "rejected", reason: "crisis" }],
    [true, false, false, { outcome: "rejected", reason: "crisis" }],
    [false, true, true, { outcome: "rejected", reason: "moderation" }],
    [false, true, false, { outcome: "rejected", reason: "moderation" }],
    [false, false, true, { outcome: "rejected", reason: "contact_info", contactKinds: ["phone"] }],
    [false, false, false, { outcome: "held" }],
  ])("crisis=%s aggression=%s contact=%s → %j", (flaggedCrisis, flaggedDirectedAggression, hasContact, expected) => {
    const result = resolveLetterSafetyOutcome(
      { flaggedCrisis, flaggedDirectedAggression },
      hasContact ? CONTACT : NO_CONTACT
    );

    expect(result).toEqual(expected);
  });

  // flaggedGeneral is recorded, but it is no longer a verdict for letters (#265).
  it("ignores flaggedGeneral: a letter flagged only in general waits for the human queue", () => {
    const flags: ModerationFlags = { flaggedCrisis: false, flaggedGeneral: true, flaggedDirectedAggression: false };

    expect(resolveLetterSafetyOutcome(flags, NO_CONTACT)).toEqual({ outcome: "held" });
  });
});

describe("checkLetterSafety", () => {
  describe.each([
    {
      language: "ES",
      honest: "Gracias por tu frase. Me hizo sentir menos sola esta semana.",
      withPhone: "Me ayudó mucho leerte, llámame al 55 1234 5678",
      withHandle: "Si quieres seguir hablando, mi insta es luna.triste22",
    },
    {
      language: "EN",
      honest: "Thank you for your words. I felt less alone this week.",
      withPhone: "Reading you helped a lot, call me at 555 123 4567",
      withHandle: "If you want to keep talking, my ig is lonely_wolf22",
    },
  ])("$language", ({ honest, withPhone, withHandle }) => {
    it("lets an honest letter wait for review", async () => {
      moderateTextMock.mockResolvedValue(CLEAN);

      expect(await checkLetterSafety(honest)).toEqual({ outcome: "held" });
    });

    it.each([
      ["phone", "withPhone"],
      ["handle", "withHandle"],
    ] as const)("rejects a letter with a %s, and says what was found", async (kind, key) => {
      moderateTextMock.mockResolvedValue(CLEAN);
      const body = key === "withPhone" ? withPhone : withHandle;

      expect(await checkLetterSafety(body)).toEqual({ outcome: "rejected", reason: "contact_info", contactKinds: [kind] });
    });

    it("treats a crisis letter as crisis even when it also carries contact info", async () => {
      moderateTextMock.mockResolvedValue(CRISIS);

      expect(await checkLetterSafety(withPhone)).toEqual({ outcome: "rejected", reason: "crisis" });
    });

    // OpenAI doesn't flag it, but the self-harm score crosses Refugio's own, more
    // conservative threshold (CRISIS_THRESHOLD): still crisis.
    it("treats a letter below OpenAI's flag but above our self-harm threshold as crisis", async () => {
      moderateTextMock.mockResolvedValue(selfHarmOnlyModerationCheckFixture);

      expect(await checkLetterSafety(honest)).toEqual({ outcome: "rejected", reason: "crisis" });
    });

    // #265: `violence` alone is what grief about how someone died looks like to OpenAI.
    // The human queue decides it, not the API.
    it("lets a letter flagged only in general wait for review", async () => {
      moderateTextMock.mockResolvedValue(GENERAL);

      expect(await checkLetterSafety(honest)).toEqual({ outcome: "held" });
    });

    it("rejects a letter carrying aggression aimed at a person", async () => {
      moderateTextMock.mockResolvedValue(AGGRESSION);

      expect(await checkLetterSafety(honest)).toEqual({ outcome: "rejected", reason: "moderation" });
    });

    // Contact info is the lower-priority signal, so a general flag must not mask it now
    // that it no longer rejects on its own.
    it("still rejects contact info in a letter that is also flagged in general", async () => {
      moderateTextMock.mockResolvedValue(GENERAL);

      expect(await checkLetterSafety(withPhone)).toEqual({
        outcome: "rejected",
        reason: "contact_info",
        contactKinds: ["phone"],
      });
    });
  });

  it("moderates the letter's exact text", async () => {
    moderateTextMock.mockResolvedValue(CLEAN);

    await checkLetterSafety("hola");

    expect(moderateTextMock).toHaveBeenCalledWith("hola");
  });

  it("fails closed: a moderation error propagates instead of letting the letter through", async () => {
    moderateTextMock.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(checkLetterSafety("Gracias por tu frase.")).rejects.toThrow("OpenAI unavailable");
  });
});

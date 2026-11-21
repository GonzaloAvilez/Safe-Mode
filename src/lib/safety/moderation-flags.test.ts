import { describe, expect, it } from "vitest";
import { resolveModerationFlags } from "@/lib/safety/moderation-flags";
import type { ModerationCategory } from "@/lib/safety/letter-auto-reject";

const CALM = { "self-harm": 0.001, "self-harm/intent": 0.001, "self-harm/instructions": 0.001 };

describe("resolveModerationFlags", () => {
  it("returns every flag false when moderation does not flag the content", () => {
    const result = resolveModerationFlags({ flagged: false, flaggedCategories: [], selfHarmScores: CALM });

    expect(result).toEqual({ flaggedCrisis: false, flaggedGeneral: false, flaggedLetterAutoReject: false });
  });

  it("sets flaggedGeneral (not flaggedCrisis) when a non-self-harm category is flagged", () => {
    const result = resolveModerationFlags({ flagged: true, flaggedCategories: ["violence"], selfHarmScores: CALM });

    expect(result).toEqual({ flaggedCrisis: false, flaggedGeneral: true, flaggedLetterAutoReject: false });
  });

  it("sets flaggedCrisis (not flaggedGeneral) when a self-harm score crosses the conservative threshold", () => {
    const result = resolveModerationFlags({
      flagged: true,
      flaggedCategories: ["self-harm"],
      selfHarmScores: { ...CALM, "self-harm": 0.9 },
    });

    expect(result).toEqual({ flaggedCrisis: true, flaggedGeneral: false, flaggedLetterAutoReject: false });
  });

  it("treats crisis and general as mutually exclusive even when OpenAI flags multiple categories at once", () => {
    // flagged=true because of both self-harm AND another category (e.g. violence) tripping in the same call.
    const result = resolveModerationFlags({
      flagged: true,
      flaggedCategories: ["self-harm", "violence"],
      selfHarmScores: { ...CALM, "self-harm": 0.9, "self-harm/intent": 0.9 },
    });

    expect(result.flaggedCrisis).toBe(true);
    expect(result.flaggedGeneral).toBe(false);
  });

  it("triggers flaggedCrisis from our conservative self-harm threshold even if OpenAI's own flagged is false", () => {
    // This is the whole point of our custom threshold: catch borderline self-harm content
    // that OpenAI's own default moderation threshold didn't flag.
    const result = resolveModerationFlags({
      flagged: false,
      flaggedCategories: [],
      selfHarmScores: { ...CALM, "self-harm": 0.9 },
    });

    expect(result).toEqual({ flaggedCrisis: true, flaggedGeneral: false, flaggedLetterAutoReject: false });
  });

  describe("flaggedLetterAutoReject", () => {
    it("is set when an auto-reject category fires, alongside flaggedGeneral", () => {
      const result = resolveModerationFlags({
        flagged: true,
        flaggedCategories: ["harassment", "harassment/threatening", "violence"],
        selfHarmScores: CALM,
      });

      expect(result).toEqual({ flaggedCrisis: false, flaggedGeneral: true, flaggedLetterAutoReject: true });
    });

    // The #265 false positives: describing how someone died, with nothing aimed at anyone.
    it.each([["violence"], ["violence/graphic"]] as ModerationCategory[][])(
      "stays false for %s on its own, even though OpenAI flagged the text",
      (category) => {
        const result = resolveModerationFlags({ flagged: true, flaggedCategories: [category], selfHarmScores: CALM });

        expect(result.flaggedGeneral).toBe(true);
        expect(result.flaggedLetterAutoReject).toBe(false);
      }
    );

    it("stays false when crisis wins, so the sender gets help rather than a rejection", () => {
      const result = resolveModerationFlags({
        flagged: true,
        flaggedCategories: ["self-harm", "harassment/threatening"],
        selfHarmScores: { ...CALM, "self-harm": 0.9 },
      });

      expect(result).toEqual({ flaggedCrisis: true, flaggedGeneral: false, flaggedLetterAutoReject: false });
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolveModerationFlags } from "@/lib/safety/moderation-flags";

describe("resolveModerationFlags", () => {
  it("returns both flags false when moderation does not flag the content", () => {
    const result = resolveModerationFlags({
      flagged: false,
      selfHarmScores: { "self-harm": 0.001, "self-harm/intent": 0.001, "self-harm/instructions": 0.001 },
    });

    expect(result).toEqual({ flaggedCrisis: false, flaggedGeneral: false });
  });

  it("sets flaggedGeneral (not flaggedCrisis) when a non-self-harm category is flagged", () => {
    const result = resolveModerationFlags({
      flagged: true,
      selfHarmScores: { "self-harm": 0.001, "self-harm/intent": 0.001, "self-harm/instructions": 0.001 },
    });

    expect(result).toEqual({ flaggedCrisis: false, flaggedGeneral: true });
  });

  it("sets flaggedCrisis (not flaggedGeneral) when a self-harm score crosses the conservative threshold", () => {
    const result = resolveModerationFlags({
      flagged: true,
      selfHarmScores: { "self-harm": 0.9, "self-harm/intent": 0.001, "self-harm/instructions": 0.001 },
    });

    expect(result).toEqual({ flaggedCrisis: true, flaggedGeneral: false });
  });

  it("treats the two flags as mutually exclusive even when OpenAI flags multiple categories at once", () => {
    // flagged=true because of both self-harm AND another category (e.g. violence) tripping in the same call.
    const result = resolveModerationFlags({
      flagged: true,
      selfHarmScores: { "self-harm": 0.9, "self-harm/intent": 0.9, "self-harm/instructions": 0.001 },
    });

    expect(result.flaggedCrisis).toBe(true);
    expect(result.flaggedGeneral).toBe(false);
  });

  it("triggers flaggedCrisis from our conservative self-harm threshold even if OpenAI's own flagged is false", () => {
    // This is the whole point of our custom threshold: catch borderline self-harm content
    // that OpenAI's own default moderation threshold didn't flag.
    const result = resolveModerationFlags({
      flagged: false,
      selfHarmScores: { "self-harm": 0.9, "self-harm/intent": 0.001, "self-harm/instructions": 0.001 },
    });

    expect(result).toEqual({ flaggedCrisis: true, flaggedGeneral: false });
  });
});

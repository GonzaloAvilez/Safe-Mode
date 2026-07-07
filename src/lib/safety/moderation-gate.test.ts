import { describe, expect, it } from "vitest";
import { CRISIS_THRESHOLD, shouldTriggerCrisisFlow } from "@/lib/safety/moderation-gate";

describe("shouldTriggerCrisisFlow", () => {
  it("returns false when all self-harm scores are well below the threshold", () => {
    const scores = {
      "self-harm": 0.01,
      "self-harm/intent": 0.02,
      "self-harm/instructions": 0.0,
    };

    expect(shouldTriggerCrisisFlow(scores)).toBe(false);
  });

  it("returns true when any self-harm score meets the threshold", () => {
    const scores = {
      "self-harm": 0.01,
      "self-harm/intent": CRISIS_THRESHOLD,
      "self-harm/instructions": 0.0,
    };

    expect(shouldTriggerCrisisFlow(scores)).toBe(true);
  });

  it("treats the threshold as inclusive (errs conservative at the boundary)", () => {
    const scores = {
      "self-harm": CRISIS_THRESHOLD,
      "self-harm/intent": 0,
      "self-harm/instructions": 0,
    };

    expect(shouldTriggerCrisisFlow(scores)).toBe(true);
  });

  it("returns true when any score exceeds the threshold, even if others are zero", () => {
    const scores = {
      "self-harm": 0,
      "self-harm/intent": 0,
      "self-harm/instructions": 0.99,
    };

    expect(shouldTriggerCrisisFlow(scores)).toBe(true);
  });

  it("respects a custom threshold override", () => {
    const scores = {
      "self-harm": 0.5,
      "self-harm/intent": 0,
      "self-harm/instructions": 0,
    };

    expect(shouldTriggerCrisisFlow(scores, 0.6)).toBe(false);
    expect(shouldTriggerCrisisFlow(scores, 0.4)).toBe(true);
  });
});

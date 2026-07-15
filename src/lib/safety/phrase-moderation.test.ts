import { describe, expect, it } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
  generalFlaggedModerationCheckFixture,
  selfHarmOnlyModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import {
  resolvePhraseModerationStatus,
  shouldActivatePhrase,
} from "@/lib/safety/phrase-moderation";

describe("resolvePhraseModerationStatus", () => {
  it("returns approved when the moderation result is not flagged and under the self-harm threshold", () => {
    expect(resolvePhraseModerationStatus(benignModerationCheckFixture)).toBe("approved");
  });

  it("returns rejected when OpenAI's own moderation flags it", () => {
    expect(resolvePhraseModerationStatus(concerningModerationCheckFixture)).toBe("rejected");
  });

  it("returns rejected for a non-self-harm flagged category too", () => {
    expect(resolvePhraseModerationStatus(generalFlaggedModerationCheckFixture)).toBe("rejected");
  });

  it("returns rejected when self-harm scores cross the conservative threshold, even if not flagged", () => {
    expect(resolvePhraseModerationStatus(selfHarmOnlyModerationCheckFixture)).toBe("rejected");
  });
});

describe("shouldActivatePhrase", () => {
  it("returns true for an approved status", () => {
    expect(shouldActivatePhrase("approved")).toBe(true);
  });

  it("returns false for a rejected status", () => {
    expect(shouldActivatePhrase("rejected")).toBe(false);
  });

  it("returns false for a pending status", () => {
    expect(shouldActivatePhrase("pending")).toBe(false);
  });
});

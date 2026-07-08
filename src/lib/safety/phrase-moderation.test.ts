import { describe, expect, it } from "vitest";
import {
  resolvePhraseModerationStatus,
  shouldActivatePhrase,
} from "@/lib/safety/phrase-moderation";

describe("resolvePhraseModerationStatus", () => {
  it("returns approved when the moderation result is not flagged", () => {
    expect(resolvePhraseModerationStatus({ flagged: false })).toBe("approved");
  });

  it("returns rejected when the moderation result is flagged", () => {
    expect(resolvePhraseModerationStatus({ flagged: true })).toBe("rejected");
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

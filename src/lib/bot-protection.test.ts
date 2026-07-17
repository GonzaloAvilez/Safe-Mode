import { describe, expect, it } from "vitest";
import { isSuspectedBot } from "@/lib/bot-protection";

describe("isSuspectedBot", () => {
  it("flags a filled honeypot regardless of timing", () => {
    const formRenderedAt = Date.now() - 10_000;

    expect(isSuspectedBot({ honeypot: "http://spam.example", formRenderedAt })).toBe(true);
  });

  it("flags a submit faster than the minimum human fill time", () => {
    const formRenderedAt = Date.now() - 100;

    expect(isSuspectedBot({ honeypot: "", formRenderedAt })).toBe(true);
  });

  it("flags a missing or malformed formRenderedAt", () => {
    expect(isSuspectedBot({ honeypot: "", formRenderedAt: undefined })).toBe(true);
    expect(isSuspectedBot({ honeypot: "", formRenderedAt: "not-a-number" })).toBe(true);
  });

  it("passes a real submission: empty honeypot, rendered long enough ago", () => {
    const formRenderedAt = Date.now() - 5_000;

    expect(isSuspectedBot({ honeypot: "", formRenderedAt })).toBe(false);
  });
});

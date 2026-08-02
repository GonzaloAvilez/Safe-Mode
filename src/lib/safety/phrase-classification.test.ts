import { describe, expect, it } from "vitest";
import { sanitizeClassification } from "@/lib/safety/phrase-classification";
import type { PhraseClassification } from "@/lib/openai";

function classification(overrides: Partial<PhraseClassification> = {}): PhraseClassification {
  return {
    primaryTheme: "grief",
    primaryNeed: "connection",
    transitionFrom: "isolated",
    transitionTo: "seen",
    publicNarrative: "A quiet shift from isolation toward feeling seen",
    confidence: 0.8,
    totalTokens: 42,
    ...overrides,
  };
}

describe("sanitizeClassification", () => {
  it("leaves an already-compliant classification unchanged", () => {
    const input = classification();

    expect(sanitizeClassification(input)).toEqual(input);
  });

  it("trims public_narrative down to 10 words when the model overruns", () => {
    const input = classification({
      publicNarrative: "one two three four five six seven eight nine ten eleven twelve",
    });

    const result = sanitizeClassification(input);

    expect(result.publicNarrative).toBe("one two three four five six seven eight nine ten");
  });

  it("collapses extra whitespace when trimming public_narrative", () => {
    const input = classification({ publicNarrative: "  one   two three  " });

    const result = sanitizeClassification(input);

    expect(result.publicNarrative).toBe("one two three");
  });

  it("clamps confidence above 1 down to 1", () => {
    const result = sanitizeClassification(classification({ confidence: 1.4 }));

    expect(result.confidence).toBe(1);
  });

  it("clamps confidence below 0 up to 0", () => {
    const result = sanitizeClassification(classification({ confidence: -0.2 }));

    expect(result.confidence).toBe(0);
  });

  it("does not mutate other fields", () => {
    const input = classification({ primaryTheme: "longing", totalTokens: 99 });

    const result = sanitizeClassification(input);

    expect(result.primaryTheme).toBe("longing");
    expect(result.totalTokens).toBe(99);
  });
});

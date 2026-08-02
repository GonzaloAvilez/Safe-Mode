import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_COST_PER_1M_TOKENS_USD,
  actualClassificationCostUsd,
  estimateClassificationCostUsd,
} from "@/lib/safety/classification-cost";

describe("estimateClassificationCostUsd", () => {
  it("returns 0 for empty input", () => {
    expect(estimateClassificationCostUsd(0)).toBe(0);
  });

  it("estimates roughly 1 token per 4 characters", () => {
    const costFor4Chars = estimateClassificationCostUsd(4);
    const costFor800Chars = estimateClassificationCostUsd(800);

    expect(costFor800Chars).toBeCloseTo(costFor4Chars * 200, 10);
  });

  it("rounds up partial tokens so the estimate never undercounts", () => {
    const costFor5Chars = estimateClassificationCostUsd(5);
    const costFor4Chars = estimateClassificationCostUsd(4);

    expect(costFor5Chars).toBeGreaterThan(costFor4Chars);
  });

  it("stays well within a cent for a phrase-length input (120 chars, Leave a Trace's cap)", () => {
    expect(estimateClassificationCostUsd(120)).toBeLessThan(0.01);
  });
});

describe("actualClassificationCostUsd", () => {
  it("returns 0 for 0 tokens", () => {
    expect(actualClassificationCostUsd(0)).toBe(0);
  });

  it("returns the full per-1M-token price for exactly 1,000,000 tokens", () => {
    expect(actualClassificationCostUsd(1_000_000)).toBeCloseTo(CLASSIFICATION_COST_PER_1M_TOKENS_USD, 10);
  });

  it("scales linearly with token count", () => {
    expect(actualClassificationCostUsd(500_000)).toBeCloseTo(CLASSIFICATION_COST_PER_1M_TOKENS_USD / 2, 10);
  });
});

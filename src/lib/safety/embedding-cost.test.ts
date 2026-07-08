import { describe, expect, it } from "vitest";
import {
  EMBEDDING_COST_PER_1M_TOKENS_USD,
  actualEmbeddingCostUsd,
  estimateEmbeddingCostUsd,
} from "@/lib/safety/embedding-cost";

describe("estimateEmbeddingCostUsd", () => {
  it("returns 0 for empty input", () => {
    expect(estimateEmbeddingCostUsd(0)).toBe(0);
  });

  it("estimates roughly 1 token per 4 characters", () => {
    const costFor4Chars = estimateEmbeddingCostUsd(4);
    const costFor800Chars = estimateEmbeddingCostUsd(800);

    expect(costFor800Chars).toBeCloseTo(costFor4Chars * 200, 10);
  });

  it("rounds up partial tokens so the estimate never undercounts", () => {
    // 5 chars -> ceil(5/4) = 2 tokens, not 1
    const costFor5Chars = estimateEmbeddingCostUsd(5);
    const costFor4Chars = estimateEmbeddingCostUsd(4);

    expect(costFor5Chars).toBeGreaterThan(costFor4Chars);
  });

  it("stays well within a cent for the max input length (800 chars, screen 05's cap)", () => {
    expect(estimateEmbeddingCostUsd(800)).toBeLessThan(0.01);
  });
});

describe("actualEmbeddingCostUsd", () => {
  it("returns 0 for 0 tokens", () => {
    expect(actualEmbeddingCostUsd(0)).toBe(0);
  });

  it("returns the full per-1M-token price for exactly 1,000,000 tokens", () => {
    expect(actualEmbeddingCostUsd(1_000_000)).toBeCloseTo(EMBEDDING_COST_PER_1M_TOKENS_USD, 10);
  });

  it("scales linearly with token count", () => {
    expect(actualEmbeddingCostUsd(500_000)).toBeCloseTo(EMBEDDING_COST_PER_1M_TOKENS_USD / 2, 10);
  });
});

import type { EmbeddingResult } from "@/lib/openai";

export const embeddingResultFixture: EmbeddingResult = {
  embedding: [0.01, -0.02, 0.03, 0.04, -0.05],
  totalTokens: 6,
};

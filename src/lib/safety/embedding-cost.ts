// text-embedding-3-small pricing. Only embeddings cost money — Moderation API is free.
export const EMBEDDING_COST_PER_1M_TOKENS_USD = 0.02;
const CHARS_PER_TOKEN_ESTIMATE = 4;

// Pre-call estimate from input length, used to gate the request before we know the real token count.
// Rounds up so it never undercounts.
export function estimateEmbeddingCostUsd(charCount: number): number {
  const estimatedTokens = Math.ceil(charCount / CHARS_PER_TOKEN_ESTIMATE);
  return actualEmbeddingCostUsd(estimatedTokens);
}

// Post-call cost from the real token count in the API response's usage field.
export function actualEmbeddingCostUsd(totalTokens: number): number {
  return (totalTokens / 1_000_000) * EMBEDDING_COST_PER_1M_TOKENS_USD;
}

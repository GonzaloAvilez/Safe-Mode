// gpt-4o-mini pricing: $0.15/1M input tokens, $0.60/1M output tokens. The API only
// reports a single total_tokens figure (no input/output split), so this uses the more
// expensive output rate as a single blended estimate — conservative in the same
// direction as embedding-cost.ts's rounding-up estimate, never undercounts the cap.
export const CLASSIFICATION_COST_PER_1M_TOKENS_USD = 0.6;
const CHARS_PER_TOKEN_ESTIMATE = 4;

// Pre-call estimate from input length, used to gate the request before we know the real token count.
// Rounds up so it never undercounts.
export function estimateClassificationCostUsd(charCount: number): number {
  const estimatedTokens = Math.ceil(charCount / CHARS_PER_TOKEN_ESTIMATE);
  return actualClassificationCostUsd(estimatedTokens);
}

// Post-call cost from the real token count in the API response's usage field.
export function actualClassificationCostUsd(totalTokens: number): number {
  return (totalTokens / 1_000_000) * CLASSIFICATION_COST_PER_1M_TOKENS_USD;
}

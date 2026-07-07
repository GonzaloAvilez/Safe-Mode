export const DAILY_SPEND_CAP_USD = 5;

export function canSpend(
  currentSpentUSD: number,
  estimatedCostUSD: number,
  capUSD: number = DAILY_SPEND_CAP_USD
): boolean {
  return currentSpentUSD + estimatedCostUSD <= capUSD;
}

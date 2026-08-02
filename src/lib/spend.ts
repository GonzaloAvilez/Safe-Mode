import { supabaseAdmin } from "@/lib/supabase";
import { canSpend, DAILY_SPEND_CAP_USD } from "@/lib/safety/spend-cap";
import { actualEmbeddingCostUsd } from "@/lib/safety/embedding-cost";
import { actualClassificationCostUsd } from "@/lib/safety/classification-cost";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaysSpendUsd(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("daily_spend")
    .select("total_usd")
    .eq("date", todayDateString())
    .maybeSingle();

  if (error) throw error;

  return data?.total_usd ?? 0;
}

// Pre-call gate: read today's accumulated spend and check it against the hard cap.
export async function canSpendToday(estimatedCostUsd: number): Promise<boolean> {
  const currentSpentUsd = await getTodaysSpendUsd();
  return canSpend(currentSpentUsd, estimatedCostUsd, DAILY_SPEND_CAP_USD);
}

// Post-call bookkeeping: record the real cost from the embeddings response's token usage.
// tokens rides along at no extra API cost — it's already in the response we just got back,
// previously computed into amount_usd and then discarded instead of persisted.
export async function recordEmbeddingSpend(totalTokens: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_daily_spend", {
    spend_date: todayDateString(),
    amount_usd: actualEmbeddingCostUsd(totalTokens),
    tokens: totalTokens,
  });

  if (error) throw error;
}

// Same increment_daily_spend RPC as recordEmbeddingSpend — it's already generic
// (amount_usd/tokens, not embedding-specific), so classification spend blends into
// the same shared $5/day total rather than needing its own tracking path.
export async function recordClassificationSpend(totalTokens: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_daily_spend", {
    spend_date: todayDateString(),
    amount_usd: actualClassificationCostUsd(totalTokens),
    tokens: totalTokens,
  });

  if (error) throw error;
}

import { supabaseAdmin } from "@/lib/supabase";
import { canSpend, DAILY_SPEND_CAP_USD } from "@/lib/safety/spend-cap";
import { actualEmbeddingCostUsd } from "@/lib/safety/embedding-cost";

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
export async function recordEmbeddingSpend(totalTokens: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_daily_spend", {
    spend_date: todayDateString(),
    amount_usd: actualEmbeddingCostUsd(totalTokens),
  });

  if (error) throw error;
}

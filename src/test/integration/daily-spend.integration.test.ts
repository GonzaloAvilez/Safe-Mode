// Runs against a real local Postgres + PostgREST (npm run test:integration), not mocks.
// This is the exact class of bug a mocked unit test structurally can't catch: on
// 2026-07-15, a migration that intended to replace increment_daily_spend's signature
// instead left two overloads coexisting, and every real call failed with PGRST203
// ("Could not choose the best candidate function") — invisible to phrase-spend.test.ts's
// mocked RPC, which just returns whatever the test tells it to.
import { afterEach, describe, expect, it } from "vitest";
import { recordEmbeddingSpend } from "@/lib/spend";
import { supabaseAdmin } from "@/lib/supabase";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

afterEach(async () => {
  await supabaseAdmin.from("daily_spend").delete().eq("date", todayDateString());
});

describe("recordEmbeddingSpend (integration)", () => {
  it("calls increment_daily_spend against a real database without ambiguity errors", async () => {
    await expect(recordEmbeddingSpend(200)).resolves.toBeUndefined();
  });

  it("accumulates call_count, total_tokens, and total_usd across multiple calls", async () => {
    await recordEmbeddingSpend(100);
    await recordEmbeddingSpend(150);

    const { data, error } = await supabaseAdmin
      .from("daily_spend")
      .select("call_count, total_tokens, total_usd")
      .eq("date", todayDateString())
      .single();

    if (error) throw error;
    expect(data.call_count).toBe(2);
    expect(data.total_tokens).toBe(250);
    expect(data.total_usd).toBeCloseTo((250 / 1_000_000) * 0.02, 10);
  });
});

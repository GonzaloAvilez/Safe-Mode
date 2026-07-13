import { supabaseAdmin } from "@/lib/supabase";
import { getEmbedding, moderateText } from "@/lib/openai";
import { resolvePhraseModerationStatus, shouldActivatePhrase } from "@/lib/safety/phrase-moderation";
import { estimateEmbeddingCostUsd } from "@/lib/safety/embedding-cost";
import { canSpendToday, recordEmbeddingSpend } from "@/lib/spend";

export type PhraseMatch = {
  id: string;
  text: string;
  similarity: number;
};

// Closest active phrase to the given embedding, or null when the corpus has no match (e.g. before D7 seeding).
export async function findClosestPhrase(embedding: number[]): Promise<PhraseMatch | null> {
  const { data, error } = await supabaseAdmin.rpc("match_phrase", { query_embedding: embedding });

  if (error) throw error;

  return data?.[0] ?? null;
}

// Inserts with the table defaults: moderation_status='pending', active=false.
// The phrase is never visible in the public corpus until finalizeUserPhraseModeration runs.
export async function submitUserPhrase(text: string): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({ text, source: "user" })
    .select("id")
    .single();

  if (error) throw error;

  return { id: data.id };
}

// Intended to be scheduled with Next's after() so it runs post-response,
// without making the person who left a trace wait on the moderation call.
//
// Activating a phrase without an embedding is exactly the bug that made Observe 500
// for every visitor the first time a user phrase got approved (found 2026-07-12,
// row goes active=true with embedding=NULL, Observe's pairwise similarity loop
// throws on it) — so this only ever sets active:true in the same write that also
// sets a real embedding, never separately.
export async function finalizeUserPhraseModeration(id: string, text: string): Promise<void> {
  const { flagged } = await moderateText(text);
  const status = resolvePhraseModerationStatus({ flagged });

  if (!shouldActivatePhrase(status)) {
    const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: status }).eq("id", id);
    if (error) throw error;
    return;
  }

  // Same daily hard cap D4 already enforces for entry embeddings — without this
  // check, Leave a Trace would be an unmetered second spend path. If the cap is
  // already hit, leave the phrase pending rather than activating it with no
  // embedding; a human can revisit it later via Supabase Studio.
  const withinDailyCap = await canSpendToday(estimateEmbeddingCostUsd(text.length));
  if (!withinDailyCap) return;

  const { embedding, totalTokens } = await getEmbedding(text);
  await recordEmbeddingSpend(totalTokens);

  const { error } = await supabaseAdmin
    .from("phrases")
    .update({ moderation_status: status, active: true, embedding })
    .eq("id", id);

  if (error) throw error;
}

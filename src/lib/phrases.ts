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
// finalizeUserPhraseModeration (below) resolves this automatically moments later.
export async function submitUserPhrase(text: string): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({ text, source: "user" })
    .select("id")
    .single();

  if (error) throw error;

  return { id: data.id };
}

// Intended to be scheduled with Next's after() so it runs post-response, without making
// the person who left a trace wait on the moderation call. The corpus grows organically —
// OpenAI's verdict alone decides approved vs. rejected, no human gate before publish (a
// human can still audit and override anything after the fact via /admin/phrases). Reuses
// setPhraseActive for the activation half so the embedding/spend-cap logic only lives in
// one place, shared with the admin "Aprobar"/"Activar" actions below.
export async function finalizeUserPhraseModeration(id: string, text: string): Promise<void> {
  const { flagged } = await moderateText(text);
  const status = resolvePhraseModerationStatus({ flagged });

  const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: status }).eq("id", id);
  if (error) throw error;

  if (!shouldActivatePhrase(status)) return;

  try {
    await setPhraseActive(id, true);
  } catch {
    // Approved, not yet active — e.g. the daily spend cap was hit at this exact moment.
    // An admin can retry via "Activar" in /admin/phrases once it resets.
  }
}

// Ensures the phrase has a real embedding before activating it — this is the invariant
// that made Observe 500 for every visitor the first time it was violated (2026-07-12):
// active=true with embedding=NULL crashes its pairwise similarity loop. Skips recomputing
// if an embedding already exists (e.g. re-activating after a manual deactivate), so
// toggling a phrase on/off repeatedly doesn't repeatedly spend.
export async function setPhraseActive(id: string, active: boolean): Promise<void> {
  if (!active) {
    const { error } = await supabaseAdmin.from("phrases").update({ active: false }).eq("id", id);
    if (error) throw error;
    return;
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("phrases")
    .select("text, embedding, moderation_status")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  if (!shouldActivatePhrase(data.moderation_status)) {
    throw new Error("Phrase must be approved before it can be activated.");
  }

  if (data.embedding !== null) {
    const { error } = await supabaseAdmin.from("phrases").update({ active: true }).eq("id", id);
    if (error) throw error;
    return;
  }

  // Same daily hard cap D4 already enforces for entry embeddings — without this check,
  // activating phrases would be an unmetered second spend path.
  const withinDailyCap = await canSpendToday(estimateEmbeddingCostUsd(data.text.length));
  if (!withinDailyCap) throw new Error("Daily spend cap reached — try again later.");

  const { embedding, totalTokens } = await getEmbedding(data.text);
  await recordEmbeddingSpend(totalTokens);

  const { error } = await supabaseAdmin.from("phrases").update({ active: true, embedding }).eq("id", id);
  if (error) throw error;
}

// Admin override — approves a phrase OpenAI itself rejected (or re-affirms one already
// approved). Also tries to activate immediately, but if that fails only because the daily
// spend cap is currently exhausted, the phrase still ends up correctly approved-but-inactive
// rather than losing the approval decision; an admin can retry with setPhraseActive once
// the cap resets.
export async function approvePhrase(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: "approved" }).eq("id", id);
  if (error) throw error;

  try {
    await setPhraseActive(id, true);
  } catch {
    // Approved, not yet active — see setPhraseActive's cap/guard failures. An admin can
    // retry activation later; the approval itself already landed.
  }
}

// Admin rejection — always deactivates too, so a previously-approved phrase can't stay
// live in the corpus after being overturned.
export async function rejectPhrase(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: "rejected" }).eq("id", id);
  if (error) throw error;

  await setPhraseActive(id, false);
}

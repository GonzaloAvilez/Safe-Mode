import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";
import { getEmbedding, moderateText } from "@/lib/openai";
import { resolvePhraseModerationStatus, shouldActivatePhrase } from "@/lib/safety/phrase-moderation";
import { estimateEmbeddingCostUsd } from "@/lib/safety/embedding-cost";
import { canSpendToday, recordEmbeddingSpend } from "@/lib/spend";
import { PhraseOrigin } from "@/lib/phrase-origin";

export type PhraseMatch = {
  id: string;
  text: string;
  similarity: number;
};

// One row per language (not per language-pair) — see language_thresholds migration.
// A missing row for a routed locale is a real configuration error, not a case to
// silently fall back on, so this fails the same way `unwrap` fails everywhere else.
async function getLanguageThreshold(language: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("language_thresholds")
    .select("min_similarity")
    .eq("language", language)
    .single();

  return unwrap(data, error).min_similarity;
}

// Closest active phrase to the given embedding, or null when the corpus has no match (e.g. before D7 seeding).
export async function findClosestPhrase(embedding: number[], language: string): Promise<PhraseMatch | null> {
  const minSimilarity = await getLanguageThreshold(language);
  const { data, error } = await supabaseAdmin.rpc("match_phrase", {
    query_embedding: embedding,
    match_language: language,
    min_similarity: minSimilarity,
  });

  return unwrap(data, error)?.[0] ?? null;
}

// Inserts with the table defaults: moderation_status='pending', active=false.
// finalizeUserPhraseModeration (below) resolves this automatically moments later.
// `language` is set explicitly from the submitter's locale — without it the column's
// DB default ('en') would silently mistag non-English submissions (the exact gap
// entries.ts had before locale threading: see language-content-segmented-matching in
// project memory).
export async function submitUserPhrase(text: string, origin: PhraseOrigin, language: string): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({ text, origin, source: "user", language })
    .select("id")
    .single();

  return { id: unwrap(data, error).id };
}

// Intended to be scheduled with Next's after() so it runs post-response, without making
// the person who left a trace wait on the moderation call.
// OpenAI's verdict alone decides approved vs. rejected. A human will audit and activate
// the phrases as manual audit via /admin/phrases.
export async function finalizeUserPhraseModeration(id: string, text: string): Promise<void> {
  const moderation = await moderateText(text);
  const status = resolvePhraseModerationStatus(moderation);

  const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: status }).eq("id", id);
  unwrap(null, error);
}

// Ensures the phrase has a real embedding before activating it — this is the invariant
// that made Observe 500 for every visitor the first time it was violated (2026-07-12):
// active=true with embedding=NULL crashes its pairwise similarity loop. Skips recomputing
// if an embedding already exists (e.g. re-activating after a manual deactivate), so
// toggling a phrase on/off repeatedly doesn't repeatedly spend.
export async function setPhraseActive(id: string, active: boolean): Promise<void> {
  if (!active) {
    const { error } = await supabaseAdmin.from("phrases").update({ active: false }).eq("id", id);
    unwrap(null, error);
    return;
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("phrases")
    .select("text, embedding, moderation_status")
    .eq("id", id)
    .single();
  const phrase = unwrap(data, fetchError);

  if (!shouldActivatePhrase(phrase.moderation_status)) {
    throw new Error("Phrase must be approved before it can be activated.");
  }

  if (phrase.embedding !== null) {
    const { error } = await supabaseAdmin.from("phrases").update({ active: true }).eq("id", id);
    unwrap(null, error);
    return;
  }

  // Same daily hard cap D4 already enforces for entry embeddings — without this check,
  // activating phrases would be an unmetered second spend path.
  const withinDailyCap = await canSpendToday(estimateEmbeddingCostUsd(phrase.text.length));
  if (!withinDailyCap) throw new Error("Daily spend cap reached — try again later.");

  const { embedding, totalTokens } = await getEmbedding(phrase.text);
  await recordEmbeddingSpend(totalTokens);

  const { error } = await supabaseAdmin.from("phrases").update({ active: true, embedding }).eq("id", id);
  unwrap(null, error);
}

// Admin override — approves a phrase OpenAI itself rejected (or re-affirms one already
// approved). Also tries to activate immediately, but if that fails only because the daily
// spend cap is currently exhausted, the phrase still ends up correctly approved-but-inactive
// rather than losing the approval decision; an admin can retry with setPhraseActive once
// the cap resets.
export async function approvePhrase(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("phrases").update({ moderation_status: "approved" }).eq("id", id);
  unwrap(null, error);

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
  unwrap(null, error);

  await setPhraseActive(id, false);
}

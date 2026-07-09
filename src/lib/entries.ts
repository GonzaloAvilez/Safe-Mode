import { supabaseAdmin } from "@/lib/supabase";
import { getEmbedding, moderateText } from "@/lib/openai";
import { resolveModerationFlags } from "@/lib/safety/moderation-flags";
import { resolveEntryRoute } from "@/lib/safety/entry-routing";
import { estimateEmbeddingCostUsd } from "@/lib/safety/embedding-cost";
import { canSpendToday, recordEmbeddingSpend } from "@/lib/spend";
import { findClosestPhrase, type PhraseMatch } from "@/lib/phrases";
import { createResponse } from "@/lib/responses";
import { insertCrisisContent } from "@/lib/crisis-entries";

type InsertEntryParams = {
  text: string;
  flaggedCrisis: boolean;
  flaggedGeneral: boolean;
  embedding: number[] | null;
};

async function insertEntry(params: InsertEntryParams): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("entries")
    .insert({
      // Crisis text is never stored here — it lives only in crisis_entries (see P2 of #20).
      text: params.flaggedCrisis ? null : params.text,
      flagged_crisis: params.flaggedCrisis,
      flagged_general: params.flaggedGeneral,
      embedding: params.embedding,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (params.flaggedCrisis) {
    await insertCrisisContent(data.id, params.text);
  }

  return { id: data.id };
}

export type EntryOutcome =
  | { type: "crisis"; entryId: string }
  | { type: "general_flagged"; entryId: string }
  | { type: "cap_reached"; entryId: string }
  | { type: "no_match"; entryId: string }
  | { type: "matched"; entryId: string; phrase: PhraseMatch };

export async function submitEntry(text: string, scaleBefore?: number): Promise<EntryOutcome> {
  const moderation = await moderateText(text);
  const flags = resolveModerationFlags(moderation);

  // Skip the spend-cap read entirely when already flagged — it can never change the outcome.
  const isModerationClean = !flags.flaggedCrisis && !flags.flaggedGeneral;
  const withinDailyCap = isModerationClean
    ? await canSpendToday(estimateEmbeddingCostUsd(text.length))
    : true;

  const route = resolveEntryRoute(flags, withinDailyCap);

  if (route !== "proceed") {
    const entry = await insertEntry({
      text,
      flaggedCrisis: flags.flaggedCrisis,
      flaggedGeneral: flags.flaggedGeneral,
      embedding: null,
    });
    return { type: route, entryId: entry.id };
  }

  const { embedding, totalTokens } = await getEmbedding(text);
  await recordEmbeddingSpend(totalTokens);

  const entry = await insertEntry({
    text,
    flaggedCrisis: false,
    flaggedGeneral: false,
    embedding,
  });

  await createResponse(entry.id, scaleBefore);

  const match = await findClosestPhrase(embedding);

  return match ? { type: "matched", entryId: entry.id, phrase: match } : { type: "no_match", entryId: entry.id };
}

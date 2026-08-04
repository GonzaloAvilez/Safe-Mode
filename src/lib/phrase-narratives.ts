import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";
import { classifyPhrase } from "@/lib/openai";
import { sanitizeClassification } from "@/lib/safety/phrase-classification";
import { estimateClassificationCostUsd } from "@/lib/safety/classification-cost";
import { canSpendToday, recordClassificationSpend } from "@/lib/spend";

export type PhraseNarrative = {
  phraseId: string;
  primaryTheme: string;
  primaryNeed: string;
  transitionFrom: string;
  transitionTo: string;
  publicNarrative: string;
  confidence: number;
};

// Admin-triggered, one phrase at a time — same manual, human-in-the-loop posture as
// approvePhrase/setPhraseActive. No source restriction: originally scoped to
// source='user' only on a consent argument (only classify text someone knew would be
// shown), but that same reasoning already covers seed phrases too — they're real
// reflections, deliberately shared by seeding them into the corpus, not placeholder
// content. Revised 2026-08-02, same call already made for showing their real date.
export async function classifyPhraseNarrative(phraseId: string): Promise<void> {
  const { data, error: fetchError } = await supabaseAdmin.from("phrases").select("text").eq("id", phraseId).single();
  const phrase = unwrap(data, fetchError);

  const withinDailyCap = await canSpendToday(estimateClassificationCostUsd(phrase.text.length));
  if (!withinDailyCap) throw new Error("Daily spend cap reached — try again later.");

  const classification = sanitizeClassification(await classifyPhrase(phrase.text));
  await recordClassificationSpend(classification.totalTokens);

  const { error } = await supabaseAdmin.from("phrase_narratives").upsert({
    phrase_id: phraseId,
    primary_theme: classification.primaryTheme,
    primary_need: classification.primaryNeed,
    transition_from: classification.transitionFrom,
    transition_to: classification.transitionTo,
    public_narrative: classification.publicNarrative,
    confidence: classification.confidence,
    model: "gpt-4o-mini",
  });
  unwrap(null, error);
}

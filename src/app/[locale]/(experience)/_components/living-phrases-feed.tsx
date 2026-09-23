import { supabaseAdmin } from "@/lib/supabase";
import type { Locale } from "@/lib/locale";
import { excerpt } from "./excerpt";
import { LivingPhrases, type LivingPhraseItem } from "./living-phrases";

// Display existing narrative metadata for active phrases in the selected language.
// Classification remains an explicit admin action; rendering never generates text.
// A phrase without classification still appears with its text and submission date.
async function fetchPhrasesWithNarratives(locale: Locale): Promise<LivingPhraseItem[]> {
  const { data } = await supabaseAdmin
    .from("phrases")
    .select("id, text, source, created_at")
    .eq("active", true)
    .eq("language", locale);
  const rows = data ?? [];

  let narrativesByPhraseId = new Map<string, { public_narrative: string }>();
  if (rows.length > 0) {
    const { data: narrativeData } = await supabaseAdmin
      .from("phrase_narratives")
      .select("phrase_id, public_narrative")
      .in(
        "phrase_id",
        rows.map((row) => row.id)
      );
    narrativesByPhraseId = new Map((narrativeData ?? []).map((row) => [row.phrase_id, row]));
  }

  return rows.map((row) => {
    const narrative = narrativesByPhraseId.get(row.id);
    return {
      text: excerpt(row.text),
      publicNarrative: narrative?.public_narrative,
      createdAt: row.created_at,
    };
  });
}

// Isolated behind its own component (instead of awaited at the top of Home's page.tsx)
// so the phrases query doesn't block the static shell — RulesGate/HomeGate carry no
// data dependency of their own and can stream immediately while this resolves. See
// the Suspense boundary around this component in page.tsx.
export async function LivingPhrasesFeed({ locale }: { locale: Locale }) {
  const phrases = await fetchPhrasesWithNarratives(locale);

  return <LivingPhrases phrases={phrases} />;
}

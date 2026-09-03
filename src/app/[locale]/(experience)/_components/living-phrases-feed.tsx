import { supabaseAdmin } from "@/lib/supabase";
import type { Locale } from "@/lib/locale";
import { isPublicNarrativeEnabled } from "@/lib/settings";
import { excerpt } from "./excerpt";
import { LivingPhrases, type LivingPhraseItem } from "./living-phrases";

// Part of the public-narrative experiment (see docs/workshop-updates) — off by
// default, so this always returns the exact plain-text behavior unless an admin
// has explicitly turned the flag on. Narrative is shown for any active phrase that
// has actually been classified, seed included as of 2026-08-04 (see
// docs/workshop-updates) — seed phrases are already public, team-authored content,
// same consent posture as their date already had. Same as the date: created_at
// isn't "when this was felt," it's when whoever wrote it — seed phrases too, real
// reflections, not placeholder content — dared to share it. Still gated behind this
// same flag for now, not its own toggle yet.
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
  const narrativeEnabled = await isPublicNarrativeEnabled();

  const phrases = narrativeEnabled
    ? await fetchPhrasesWithNarratives(locale)
    : (await supabaseAdmin.from("phrases").select("text").eq("active", true).eq("language", locale)).data?.map((row) => ({
        text: excerpt(row.text),
      })) ?? [];

  return <LivingPhrases phrases={phrases} />;
}

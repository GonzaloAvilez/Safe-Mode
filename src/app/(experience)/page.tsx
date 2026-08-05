import { supabaseAdmin } from "@/lib/supabase";
import { isPublicNarrativeEnabled } from "@/lib/settings";
import { ScreenHeader } from "./_shared/screen-header";
import { AmbientGlowBackground } from "./_shared/ambient-glow-background";
import { LivingPhrases, type LivingPhraseItem } from "./_components/living-phrases";
import { HomeGate } from "./_components/home-gate";

// Screen 0 — lives at "/" via the (experience) route group so it inherits the shared
// dark scene layout like every other screen. Deliberately minimal: no principle card,
// no 8-step list, no "qué es y qué no es" written out — that disclosure now lives in
// the mandatory RulesGate modal instead. Per the design pivot this came from: the home
// shouldn't explain Refugio, it should let a visitor feel it in a few seconds, the same
// way Bonnie never needed the safety of Andy's room explained to her.
//
// Same reasoning as Observe for going dynamic: this reads the live `phrases` table, so
// static prerendering would freeze the corpus at build time.
export const dynamic = "force-dynamic";

function excerpt(text: string, maxWords = 6): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}

// Part of the public-narrative experiment (see docs/workshop-updates) — off by
// default, so this always returns the exact plain-text behavior unless an admin
// has explicitly turned the flag on. Narrative is shown for any active phrase that
// has actually been classified, seed included as of 2026-08-04 (see
// docs/workshop-updates) — seed phrases are already public, team-authored content,
// same consent posture as their date already had. Same as the date: created_at
// isn't "when this was felt," it's when whoever wrote it — seed phrases too, real
// reflections, not placeholder content — dared to share it. Still gated behind this
// same flag for now, not its own toggle yet.
async function fetchPhrasesWithNarratives(): Promise<LivingPhraseItem[]> {
  const { data } = await supabaseAdmin.from("phrases").select("id, text, source, created_at").eq("active", true);
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

export default async function HomePage() {
  const narrativeEnabled = await isPublicNarrativeEnabled();

  const phrases = narrativeEnabled
    ? await fetchPhrasesWithNarratives()
    : (await supabaseAdmin.from("phrases").select("text").eq("active", true)).data?.map((row) => ({
        text: excerpt(row.text),
      })) ?? [];

  return (
    <>
      <AmbientGlowBackground />
      <LivingPhrases phrases={phrases} />

      <ScreenHeader tagline="Ecosystem of presences." />

      <HomeGate />
    </>
  );
}

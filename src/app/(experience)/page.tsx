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
// has explicitly turned the flag on. Narrative + date are only attached to
// source='user' phrases that have actually been classified; seed phrases and
// not-yet-classified user phrases always fall back to plain text.
async function fetchPhrasesWithNarratives(): Promise<LivingPhraseItem[]> {
  const { data } = await supabaseAdmin.from("phrases").select("id, text, source, created_at").eq("active", true);
  const rows = data ?? [];

  const userPhraseIds = rows.filter((row) => row.source === "user").map((row) => row.id);

  let narrativesByPhraseId = new Map<string, { public_narrative: string }>();
  if (userPhraseIds.length > 0) {
    const { data: narrativeData } = await supabaseAdmin
      .from("phrase_narratives")
      .select("phrase_id, public_narrative")
      .in("phrase_id", userPhraseIds);
    narrativesByPhraseId = new Map((narrativeData ?? []).map((row) => [row.phrase_id, row]));
  }

  return rows.map((row) => {
    const narrative = row.source === "user" ? narrativesByPhraseId.get(row.id) : undefined;
    return {
      text: excerpt(row.text),
      publicNarrative: narrative?.public_narrative,
      createdAt: narrative ? row.created_at : undefined,
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

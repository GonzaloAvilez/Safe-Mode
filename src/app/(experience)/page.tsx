import { supabaseAdmin } from "@/lib/supabase";
import { ScreenHeader } from "./_shared/screen-header";
import { AmbientGlowBackground } from "./_shared/ambient-glow-background";
import { LivingPhrases } from "./_components/living-phrases";
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

export default async function HomePage() {
  const { data } = await supabaseAdmin.from("phrases").select("text").eq("active", true);
  const phrases = (data ?? []).map((row) => excerpt(row.text));

  return (
    <>
      <AmbientGlowBackground />
      <LivingPhrases phrases={phrases} />

      <ScreenHeader tagline="ecosistema de presencias" />

      <HomeGate />
    </>
  );
}

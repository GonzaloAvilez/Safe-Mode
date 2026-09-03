import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { ScreenHeader } from "./_shared/screen-header";
import { AmbientGlowBackground } from "./_shared/ambient-glow-background";
import { LivingPhrasesFeed } from "./_components/living-phrases-feed";
import { HomeGate } from "./_components/home-gate";
import { ArrivalPhrase } from "./_components/arrival-phrase";

// Screen 0 — lives at "/" via the (experience) route group so it inherits the shared
// dark scene layout like every other screen. Deliberately minimal: no principle card,
// no 8-step list, no "qué es y qué no es" written out — that disclosure now lives in
// the mandatory RulesGate modal instead. Per the design pivot this came from: the home
// shouldn't explain Refugio, it should let a visitor feel it in a few seconds, the same
// way Bonnie never needed the safety of Andy's room explained to her.
//
// Same reasoning as Observe for going dynamic: LivingPhrasesFeed reads the live
// `phrases` table, so static prerendering would freeze the corpus at build time.
export const dynamic = "force-dynamic";

// AmbientGlowBackground/ScreenHeader/HomeGate have no data dependency of their own, so
// with nothing awaited up here they stream immediately as the static shell — the
// RulesGate modal (inside HomeGate) no longer waits on the phrases query. Only
// LivingPhrasesFeed's Supabase reads happen inside the Suspense boundary below; see
// its own file for why that fetch is isolated out of this page.
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <>
      <AmbientGlowBackground />
      <Suspense fallback={null}>
        <LivingPhrasesFeed locale={locale} />
      </Suspense>

      <ScreenHeader tagline={t("tagline")} />

      <HomeGate introPhrase={<Suspense fallback={null}><ArrivalPhrase locale={locale} /></Suspense>} />
    </>
  );
}

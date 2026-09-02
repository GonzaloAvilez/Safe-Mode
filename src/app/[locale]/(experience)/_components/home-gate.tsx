"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";
import { ScreenCta } from "../_shared/screen-cta";
import { RulesGate } from "./rules-gate";
import { ArrivalIntro } from "./arrival-intro";

const RULES_ACKNOWLEDGED_KEY = "sm:rulesAcknowledged";
const RULES_ACKNOWLEDGED_EVENT = "sm:rules-acknowledged";
const ARRIVAL_INTRO_SEEN_KEY = "sm:arrivalIntroSeen:v3";
const ARRIVAL_INTRO_SEEN_EVENT = "sm:arrival-intro-seen";

type HomeGateStage = "rules-required" | "intro-required" | "ready";

// localStorage has no same-tab change event (the native "storage" event only fires in
// *other* tabs), so writes here also dispatch this custom event to wake up
// useSyncExternalStore's subscription below.
function subscribe(onStoreChange: () => void) {
  window.addEventListener(RULES_ACKNOWLEDGED_EVENT, onStoreChange);
  window.addEventListener(ARRIVAL_INTRO_SEEN_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(RULES_ACKNOWLEDGED_EVENT, onStoreChange);
    window.removeEventListener(ARRIVAL_INTRO_SEEN_EVENT, onStoreChange);
  };
}

function getSnapshot(): HomeGateStage {
  const rulesAcknowledged = localStorage.getItem(RULES_ACKNOWLEDGED_KEY) === "true";
  if (!rulesAcknowledged) return "rules-required";

  const arrivalIntroSeen = localStorage.getItem(ARRIVAL_INTRO_SEEN_KEY) === "true";
  if (!arrivalIntroSeen) return "intro-required";

  return "ready";
}

// The server cannot read localStorage, so use Refugio's safest initial state:
// require the rules until hydration finishes and getSnapshot reads the visitor's
// real stage from the browser.
function getServerSnapshot(): HomeGateStage {
  return "rules-required";
}

// Owns the one piece of client state Home needs: whether the rules modal has been
// acknowledged. Unlike the sound toggle (which deliberately never persists — every
// visit starts silent, a mood/ambience choice), this is a safety disclosure —
// re-showing it on every single visit to someone who already read it (or already
// completed the whole flow) is just friction, not reinforcement.
export function HomeGate({ introPhrase }: { introPhrase: ReactNode }) {
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const stage = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function handleAcknowledge() {
    localStorage.setItem(RULES_ACKNOWLEDGED_KEY, "true");
    window.dispatchEvent(new Event(RULES_ACKNOWLEDGED_EVENT));
  }

  function handleIntroDone() {
    localStorage.setItem(ARRIVAL_INTRO_SEEN_KEY, "true");
    window.dispatchEvent(new Event(ARRIVAL_INTRO_SEEN_EVENT));
    router.push(`/${locale}/arrive`);
  }

  if (stage === "intro-required") {
    return <ArrivalIntro onDone={handleIntroDone} phrase={introPhrase} />;
  }

  return (
    <>
      {stage === "rules-required" && <RulesGate onAcknowledge={handleAcknowledge} />}
      <ScreenCta href="/arrive" label="Enter" accentRgb="200,160,30" disabled={stage !== "ready"} />
    </>
  );
}

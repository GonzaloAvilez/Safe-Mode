"use client";

import { useSyncExternalStore } from "react";
import { ScreenCta } from "../_shared/screen-cta";
import { RulesGate } from "./rules-gate";

const RULES_ACKNOWLEDGED_KEY = "sm:rulesAcknowledged";
const RULES_ACKNOWLEDGED_EVENT = "sm:rules-acknowledged";

// localStorage has no same-tab change event (the native "storage" event only fires in
// *other* tabs), so writes here also dispatch this custom event to wake up
// useSyncExternalStore's subscription below.
function subscribe(onStoreChange: () => void) {
  window.addEventListener(RULES_ACKNOWLEDGED_EVENT, onStoreChange);
  return () => window.removeEventListener(RULES_ACKNOWLEDGED_EVENT, onStoreChange);
}

function getSnapshot(): boolean {
  return localStorage.getItem(RULES_ACKNOWLEDGED_KEY) === "true";
}

// Server (and the client's first hydration pass) always sees "not yet acknowledged"
// — localStorage doesn't exist there. useSyncExternalStore resyncs to the real client
// value right after hydration on its own, without the hydration-mismatch risk of
// reading localStorage during a lazy useState initializer or setting state in a plain
// effect.
function getServerSnapshot(): boolean {
  return false;
}

// Owns the one piece of client state Home needs: whether the rules modal has been
// acknowledged. Unlike the sound toggle (which deliberately never persists — every
// visit starts silent, a mood/ambience choice), this is a safety disclosure —
// re-showing it on every single visit to someone who already read it (or already
// completed the whole flow) is just friction, not reinforcement.
export function HomeGate() {
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function handleAcknowledge() {
    localStorage.setItem(RULES_ACKNOWLEDGED_KEY, "true");
    window.dispatchEvent(new Event(RULES_ACKNOWLEDGED_EVENT));
  }

  return (
    <>
      {!acknowledged && <RulesGate onAcknowledge={handleAcknowledge} />}
      <ScreenCta href="/arrive" label="Enter" accentRgb="200,160,30" disabled={!acknowledged} />
    </>
  );
}

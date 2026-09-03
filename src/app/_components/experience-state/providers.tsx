"use client";

import { useCallback, type ReactNode } from "react";
import { ContributionStateProvider } from "./contribution";
import { ExperiencePreferencesProvider } from "./preferences";
import { FormTimingProvider, useFormTiming } from "./form-timing";
import { LocaleTransitionProvider, useLocaleTransition } from "./locale-transition";
import { RitualStateProvider, useRitualState } from "./ritual";

// Root composition is intentionally the only place that knows every session-state
// domain. Feature components consume the narrow context that matches their scope.
export function ExperienceProviders({ children }: { children: ReactNode }) {
  return (
    <ExperiencePreferencesProvider>
      <LocaleTransitionProvider>
        <FormTimingProvider>
          <RitualStateProvider>
            <ContributionStateProvider>{children}</ContributionStateProvider>
          </RitualStateProvider>
        </FormTimingProvider>
      </LocaleTransitionProvider>
    </ExperiencePreferencesProvider>
  );
}

// Returning home starts a new ritual, so it clears only ritual-owned state and
// supporting form/transition metadata. Preferences and Contribute remain intact.
export function useResetRitual() {
  const { clearRitualState } = useRitualState();
  const { unlock } = useLocaleTransition();
  const { resetRitualTimings } = useFormTiming();

  return useCallback(() => {
    clearRitualState();
    unlock();
    resetRitualTimings();
  }, [clearRitualState, resetRitualTimings, unlock]);
}


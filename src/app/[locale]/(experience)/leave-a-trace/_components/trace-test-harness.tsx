import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState, type LeaveATraceKey, type LeaveATracePhase } from "@/app/_components/experience-state/ritual";
import type { SealGroupIndex } from "@/lib/return-key-groups";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// Test-only: renders a Leave a Trace step inside the real ritual providers, starting from the
// state a test asks for, and prints the parts of that state a test wants to look at.
export const SEAL = "482133901756229";
export const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";

type Seed = { draft?: string; phase?: LeaveATracePhase; key?: LeaveATraceKey | null; lastAsked?: SealGroupIndex | null };

function Seeded({ seed, children }: { seed: Seed; children: ReactNode }) {
  const ritual = useRitualState();
  const [ready, setReady] = useState(false);

  // Seeds on the first effect and shows the step only afterwards, so it never mounts in a
  // state the test didn't ask for.
  useEffect(() => {
    ritual.setLeaveATraceDraft(seed.draft ?? "");
    ritual.setLeaveATracePhase(seed.phase ?? "writing");
    ritual.setLeaveATraceKey(seed.key ?? null);
    ritual.setLeaveATraceLastAsked(seed.lastAsked ?? null);
    // Test-only: the ritual state has no initial value to pass in, so it is seeded here and the
    // step is shown on the next render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready ? <>{children}</> : null;
}

function StateReadout() {
  const ritual = useRitualState();
  const { locked } = useLocaleTransition();
  return (
    <div hidden>
      <output data-testid="phase">{ritual.leaveATracePhase}</output>
      <output data-testid="draft">{ritual.leaveATraceDraft}</output>
      <output data-testid="key">{ritual.leaveATraceKey?.returnKey ?? ""}</output>
      <output data-testid="lastAsked">{ritual.leaveATraceLastAsked ?? ""}</output>
      <output data-testid="locked">{String(locked)}</output>
    </div>
  );
}

export function renderStep(ui: ReactNode, seed: Seed = {}, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <ExperienceProviders>
        <Seeded seed={seed}>{ui}</Seeded>
        <StateReadout />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

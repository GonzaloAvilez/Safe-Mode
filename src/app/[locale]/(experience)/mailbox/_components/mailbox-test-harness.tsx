import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useMailboxState, type MailboxPhase } from "@/app/_components/experience-state/mailbox";
import type { Mailbox, MailboxCorrespondence, MailboxLetter } from "@/lib/mailbox";
import type { SendLetterResult } from "./send-letter";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// Test-only: renders a mailbox step inside the real providers, starting from the state a test
// asks for, and prints the parts of that state a test wants to look at.
export const SEAL = "482133901756229";

export function letter(overrides: Partial<MailboxLetter> = {}): MailboxLetter {
  return {
    sender: "visitor",
    status: "delivered",
    body: "Leí tu frase el mismo día en que yo tampoco pude decir algo.",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function correspondence(overrides: Partial<MailboxCorrespondence> = {}): MailboxCorrespondence {
  return {
    id: "c1",
    yourSide: "author",
    state: "your_turn",
    phraseText: "Lo que no dije también pesa.",
    letters: [letter()],
    ...overrides,
  };
}

type Seed = {
  returnKey?: string | null;
  mailbox?: Mailbox | null;
  phase?: MailboxPhase;
  openCorrespondenceId?: string | null;
  letterDraft?: string;
  letterOutcome?: SendLetterResult | null;
};

function Seeded({ seed, children }: { seed: Seed; children: ReactNode }) {
  const state = useMailboxState();
  const [ready, setReady] = useState(false);

  // Seeds on the first effect and shows the step only afterwards, so it never mounts in a
  // state the test didn't ask for.
  useEffect(() => {
    state.setMailboxReturnKey(seed.returnKey ?? null);
    state.setMailbox(seed.mailbox ?? null);
    state.setMailboxPhase(seed.phase ?? "showing_seal");
    state.setOpenCorrespondenceId(seed.openCorrespondenceId ?? null);
    state.setLetterDraft(seed.letterDraft ?? "");
    state.setLetterOutcome(seed.letterOutcome ?? null);
    // Test-only: the mailbox state has no initial value to pass in, so it is seeded here and the
    // step is shown on the next render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready ? <>{children}</> : null;
}

function StateReadout() {
  const state = useMailboxState();
  const { locked } = useLocaleTransition();
  return (
    <div hidden>
      <output data-testid="phase">{state.mailboxPhase}</output>
      <output data-testid="key">{state.mailboxReturnKey ?? ""}</output>
      <output data-testid="opened">{state.mailbox ? String(state.mailbox.correspondences.length) : ""}</output>
      <output data-testid="openCorrespondence">{state.openCorrespondenceId ?? ""}</output>
      <output data-testid="draft">{state.letterDraft}</output>
      <output data-testid="outcome">{state.letterOutcome?.type ?? ""}</output>
      <output data-testid="locked">{String(locked)}</output>
    </div>
  );
}

export function renderMailbox(ui: ReactNode, seed: Seed = {}, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <ExperienceProviders>
        <Seeded seed={seed}>{ui}</Seeded>
        <StateReadout />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

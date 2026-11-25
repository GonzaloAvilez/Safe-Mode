"use client";

import { useCallback, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import { isLocale } from "@/lib/locale";
import type { SendFirstLetterResult } from "@/app/[locale]/(experience)/_shared/letters/send-letter";
import { createStrictContext } from "./create-strict-context";

export type WriteOutcome =
  | { type: "crisis" }
  | { type: "cap_reached" }
  | { type: "error"; message: string };

// ADR-004 #212: when letters are open, "choosing" comes between writing and sending (the phrase
// leaves only once the person has answered whether they want letters), "keeping" is where
// someone who said yes keeps their seal (which also confirms it). "sealed" is the closing for
// whoever kept it: the same closing, with one line more.
export type LeaveATracePhase = "writing" | "choosing" | "keeping" | "sealed" | "submitted" | "skipped";

// A seal and the gift sentence of its card, shown once (ADR-004 #212).
export type ReturnKeyWithSentence = { returnKey: string; sentence: string };

export type LeaveATraceKey = ReturnKeyWithSentence;

// ADR-004 #212, design B: a visitor writing to whoever left the phrase Mirror showed them.
//   keeping     the card with their seal; keeping it confirms it
//   writing     the paper
//   sending     the envelope closing while the letter is sent
//   sent        the letter is on its way
export type MirrorLetterPhase = "keeping" | "writing" | "sending" | "sent";

export type MirrorLetter = {
  // The entry whose phrase the letter is for: another entry starts over.
  entryId: string;
  phase: MirrorLetterPhase;
  // Back on the phrase ("Volver a su frase", "Ahora no") without losing the way: the letter
  // button picks up at `phase`.
  backOnPhrase: boolean;
  // Memory only, like every seal: never in the URL or browser storage, gone on reload. Let go of
  // once the letter leaves.
  key: ReturnKeyWithSentence | null;
  draft: string;
  // Why the paper came back (rejected, paused...), shown under it; null while writing.
  outcome: SendFirstLetterResult | null;
};

type MirrorInteraction = {
  entryId: string | null;
  resonated: boolean;
  wantsToConnect: boolean;
};

type RitualState = {
  writeDraft: string;
  setWriteDraft: Dispatch<SetStateAction<string>>;
  writeOutcome: WriteOutcome | null;
  setWriteOutcome: Dispatch<SetStateAction<WriteOutcome | null>>;
  leaveATraceDraft: string;
  setLeaveATraceDraft: Dispatch<SetStateAction<string>>;
  leaveATracePhase: LeaveATracePhase;
  setLeaveATracePhase: Dispatch<SetStateAction<LeaveATracePhase>>;
  // The seal and its gift sentence, shown once on the card (ADR-004 #212). Memory only, like
  // the drafts: never in the URL, never in browser storage, gone on reload or when the ritual
  // resets. Only its hash is stored on the server, so a lost seal can't be recovered.
  leaveATraceKey: LeaveATraceKey | null;
  setLeaveATraceKey: Dispatch<SetStateAction<LeaveATraceKey | null>>;
  mirrorInteraction: MirrorInteraction;
  setMirrorInteraction: Dispatch<SetStateAction<MirrorInteraction>>;
  mirrorLetter: MirrorLetter | null;
  setMirrorLetter: Dispatch<SetStateAction<MirrorLetter | null>>;
  // Marks the start of a request whose answer goes into this state; the function it returns says
  // whether the answer still belongs to the current ritual.
  startRitualOperation: () => () => boolean;
  clearRitualState: () => void;
};

const EMPTY_MIRROR_INTERACTION: MirrorInteraction = {
  entryId: null,
  resonated: false,
  wantsToConnect: false,
};

const [RitualStateContext, useRitualState] = createStrictContext<RitualState>("useRitualState");

// The page a path shows, without its locale: "/es/mirror" → "/mirror". Switching language keeps
// the same page, so it never counts as leaving one.
function pageOf(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  return isLocale(first) ? `/${rest.join("/")}` : pathname;
}

// Vulnerable drafts and choices stay only in memory, above the locale segment.
// They survive language changes but disappear on a full reload or closed tab.
export function RitualStateProvider({ children }: { children: ReactNode }) {
  const [writeDraft, setWriteDraft] = useState("");
  const [writeOutcome, setWriteOutcome] = useState<WriteOutcome | null>(null);
  const [leaveATraceDraft, setLeaveATraceDraft] = useState("");
  const [leaveATracePhase, setLeaveATracePhase] = useState<LeaveATracePhase>("writing");
  const [leaveATraceKey, setLeaveATraceKey] = useState<LeaveATraceKey | null>(null);
  const [mirrorInteraction, setMirrorInteraction] = useState<MirrorInteraction>(EMPTY_MIRROR_INTERACTION);
  const [mirrorLetter, setMirrorLetter] = useState<MirrorLetter | null>(null);

  // Bumped by every new ritual. A request started before that belongs to a ritual that no longer
  // exists, so its answer must not bring anything back: a seal asked for before returning home
  // would otherwise reappear, for an entry that's gone (#257 review).
  const generation = useRef(0);

  const startRitualOperation = useCallback(() => {
    const startedIn = generation.current;
    return () => startedIn === generation.current;
  }, []);

  // ADR-005: both closings keep their seal in memory so they can offer letter notices with it, and
  // let it go once the person leaves them. Leaving by the closing's own buttons is handled there;
  // this covers every other way out (another page, the browser's back button). Only the closings:
  // a seal still being kept ("keeping") waits for whoever comes back to it, as before.
  //
  // It's a rule on the current state, not on the page change: a closing's seal is never in memory
  // outside its page. That also covers a closing reached after the person had already left, like a
  // letter that finishes sending, or a seal whose confirmation lands, once they're on another page
  // (#285 review). Checked during render, so the seal is gone before anything can read it. Each
  // update makes its own condition false, so it settles in one pass.
  const pathname = usePathname();
  const page = pathname === null ? null : pageOf(pathname);
  if (page !== null && page !== "/leave-a-trace" && leaveATracePhase === "sealed" && leaveATraceKey) {
    setLeaveATraceKey(null);
  }
  if (page !== null && page !== "/mirror" && mirrorLetter?.phase === "sent" && mirrorLetter.key) {
    setMirrorLetter({ ...mirrorLetter, key: null });
  }

  const clearRitualState = useCallback(() => {
    generation.current += 1;
    setWriteDraft("");
    setWriteOutcome(null);
    setLeaveATraceDraft("");
    setLeaveATracePhase("writing");
    setLeaveATraceKey(null);
    setMirrorInteraction(EMPTY_MIRROR_INTERACTION);
    setMirrorLetter(null);
  }, []);

  return (
    <RitualStateContext.Provider
      value={{
        writeDraft,
        setWriteDraft,
        writeOutcome,
        setWriteOutcome,
        leaveATraceDraft,
        setLeaveATraceDraft,
        leaveATracePhase,
        setLeaveATracePhase,
        leaveATraceKey,
        setLeaveATraceKey,
        mirrorInteraction,
        setMirrorInteraction,
        mirrorLetter,
        setMirrorLetter,
        startRitualOperation,
        clearRitualState,
      }}
    >
      {children}
    </RitualStateContext.Provider>
  );
}

export { useRitualState };


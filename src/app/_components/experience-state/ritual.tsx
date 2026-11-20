"use client";

import { useCallback, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { SendFirstLetterResult } from "@/app/[locale]/(experience)/_shared/letters/send-letter";
import type { SealGroupIndex } from "@/lib/return-key-groups";
import { createStrictContext } from "./create-strict-context";

export type WriteOutcome =
  | { type: "crisis" }
  | { type: "general_flagged" }
  | { type: "cap_reached" }
  | { type: "error"; message: string };

// ADR-004 #212: when letters are open, "choosing" comes between writing and sending (the phrase
// leaves only once the person has answered whether they want letters), "keeping" is where
// someone who said yes keeps their seal, and "sealing" is where they light the missing light.
// "sealed" is the closing for whoever sealed it: the same closing, with one line more.
export type LeaveATracePhase = "writing" | "choosing" | "keeping" | "sealing" | "sealed" | "submitted" | "skipped";

// A seal and the gift sentence of its card, shown once (ADR-004 #212).
export type ReturnKeyWithSentence = { returnKey: string; sentence: string };

export type LeaveATraceKey = ReturnKeyWithSentence;

// ADR-004 #212, design B: a visitor writing to whoever left the phrase Mirror showed them.
//   keeping     the card with their seal
//   confirming  the missing light
//   writing     the paper
//   sending     the envelope closing while the letter is sent
//   sent        the letter is on its way
export type MirrorLetterPhase = "keeping" | "confirming" | "writing" | "sending" | "sent";

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
  // The group the missing light asked for last, so the next question is a different one.
  lastAsked: SealGroupIndex | null;
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
  // The group sealing asked for last time, so that after looking at the seal again the next
  // question is a different group.
  leaveATraceLastAsked: SealGroupIndex | null;
  setLeaveATraceLastAsked: Dispatch<SetStateAction<SealGroupIndex | null>>;
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

// Vulnerable drafts and choices stay only in memory, above the locale segment.
// They survive language changes but disappear on a full reload or closed tab.
export function RitualStateProvider({ children }: { children: ReactNode }) {
  const [writeDraft, setWriteDraft] = useState("");
  const [writeOutcome, setWriteOutcome] = useState<WriteOutcome | null>(null);
  const [leaveATraceDraft, setLeaveATraceDraft] = useState("");
  const [leaveATracePhase, setLeaveATracePhase] = useState<LeaveATracePhase>("writing");
  const [leaveATraceKey, setLeaveATraceKey] = useState<LeaveATraceKey | null>(null);
  const [leaveATraceLastAsked, setLeaveATraceLastAsked] = useState<SealGroupIndex | null>(null);
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

  const clearRitualState = useCallback(() => {
    generation.current += 1;
    setWriteDraft("");
    setWriteOutcome(null);
    setLeaveATraceDraft("");
    setLeaveATracePhase("writing");
    setLeaveATraceKey(null);
    setLeaveATraceLastAsked(null);
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
        leaveATraceLastAsked,
        setLeaveATraceLastAsked,
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


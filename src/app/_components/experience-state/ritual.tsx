"use client";

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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

export type LeaveATraceKey = { returnKey: string; sentence: string };

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

  const clearRitualState = useCallback(() => {
    setWriteDraft("");
    setWriteOutcome(null);
    setLeaveATraceDraft("");
    setLeaveATracePhase("writing");
    setLeaveATraceKey(null);
    setLeaveATraceLastAsked(null);
    setMirrorInteraction(EMPTY_MIRROR_INTERACTION);
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
        clearRitualState,
      }}
    >
      {children}
    </RitualStateContext.Provider>
  );
}

export { useRitualState };


"use client";

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createStrictContext } from "./create-strict-context";

export type WriteOutcome =
  | { type: "crisis" }
  | { type: "general_flagged" }
  | { type: "cap_reached" }
  | { type: "error"; message: string };

export type LeaveATracePhase = "writing" | "submitted" | "skipped";

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
  const [mirrorInteraction, setMirrorInteraction] = useState<MirrorInteraction>(EMPTY_MIRROR_INTERACTION);

  const clearRitualState = useCallback(() => {
    setWriteDraft("");
    setWriteOutcome(null);
    setLeaveATraceDraft("");
    setLeaveATracePhase("writing");
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


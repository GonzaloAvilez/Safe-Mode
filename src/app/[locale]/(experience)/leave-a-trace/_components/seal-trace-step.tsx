"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import type { SealGroupIndex } from "@/lib/return-key-groups";
import { ConfirmReturnKeyStep } from "../../_shared/return-key/confirm-return-key-step";

// ADR-004 #212: sealing the trace, Leave a Trace's side of "enciende la luz que falta"
// (ConfirmReturnKeyStep). Once the seal is confirmed the phrase accepts letters. Lighting the last
// light is what closes the ritual: the closing follows, so the required steps end in the closing
// instead of standing before it.
export function SealTraceStep() {
  const t = useTranslations("leaveATrace");
  const {
    leaveATraceKey: key,
    setLeaveATraceKey: setKey,
    leaveATracePhase: phase,
    setLeaveATracePhase: setPhase,
    leaveATraceLastAsked: lastAsked,
    setLeaveATraceLastAsked: setLastAsked,
  } = useRitualState();

  // A seal that isn't in memory (the ritual was reset) can't be sealed. Only while still on this
  // step: sealing lets go of the seal as it moves on, and that must not turn "sealed" into "submitted".
  useEffect(() => {
    if (!key && phase === "sealing") setPhase("submitted");
  }, [key, phase, setPhase]);
  if (!key) return null;

  // The seal leaves memory as the ritual closes: from here only whoever kept it has it.
  function closeSealed() {
    setKey(null);
    setLastAsked(null);
    setPhase("sealed");
  }

  function seeSealAgain(asked: SealGroupIndex) {
    setLastAsked(asked);
    setPhase("keeping");
  }

  function leaveWithoutLetters() {
    setKey(null);
    setLastAsked(null);
    setPhase("submitted");
  }

  return (
    <ConfirmReturnKeyStep
      returnKey={key.returnKey}
      previouslyAsked={lastAsked}
      hint={t("seal.hint")}
      failedMessage={t("seal.failed")}
      leaveLabel={t("keep.withoutLetters")}
      onConfirmed={closeSealed}
      onSeeSealAgain={seeSealAgain}
      onLeave={leaveWithoutLetters}
    />
  );
}

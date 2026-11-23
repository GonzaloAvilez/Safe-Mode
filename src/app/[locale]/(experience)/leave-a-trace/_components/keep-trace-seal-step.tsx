"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { KeepReturnKeyStep } from "../../_shared/return-key/keep-return-key-step";

// ADR-004 #212: Leave a Trace's side of keeping the seal (KeepReturnKeyStep). The seal lives in the
// ritual's memory only while the author keeps it. Keeping it confirms it, and from then on the
// phrase accepts letters; the closing follows, with one line more for whoever sealed it. "Mejor
// sin cartas" is always there: the trace is already left, it just never receives letters.
export function KeepTraceSealStep() {
  const t = useTranslations("leaveATrace");
  const {
    leaveATraceKey: key,
    setLeaveATraceKey: setKey,
    leaveATracePhase: phase,
    setLeaveATracePhase: setPhase,
  } = useRitualState();

  // A seal that isn't in memory (the ritual was reset) can't be shown: nothing left to keep. Only
  // while still on this step, so letting go of the seal on the way out never redirects anything.
  useEffect(() => {
    if (!key && phase === "keeping") setPhase("submitted");
  }, [key, phase, setPhase]);
  if (!key) return null;

  // The seal is confirmed: it leaves memory as the ritual moves on to the sealed closing. From
  // here only whoever kept it has it.
  function finishSealing() {
    setKey(null);
    setPhase("sealed");
  }

  // The seal leaves memory: the trace is left, it just never receives letters.
  function leaveWithoutLetters() {
    setKey(null);
    setPhase("submitted");
  }

  return (
    <KeepReturnKeyStep
      returnKey={key.returnKey}
      sentence={key.sentence}
      body={t("keep.body")}
      failedMessage={t("keep.failed")}
      leaveLabel={t("keep.withoutLetters")}
      onConfirmed={finishSealing}
      onLeave={leaveWithoutLetters}
    />
  );
}

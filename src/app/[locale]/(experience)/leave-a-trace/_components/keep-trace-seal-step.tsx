"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { KeepReturnKeyStep } from "../../_shared/return-key/keep-return-key-step";

// ADR-004 #212: Leave a Trace's side of keeping the seal (KeepReturnKeyStep). The seal lives in the
// ritual's memory while the author keeps and confirms it. "Mejor sin cartas" is always there: the
// trace is already left, it just never receives letters.
export function KeepTraceSealStep() {
  const t = useTranslations("leaveATrace");
  const {
    leaveATraceKey: key,
    setLeaveATraceKey: setKey,
    leaveATracePhase: phase,
    setLeaveATracePhase: setPhase,
    leaveATraceLastAsked: lastAsked,
    setLeaveATraceLastAsked: setLastAsked,
  } = useRitualState();

  // A seal that isn't in memory (the ritual was reset) can't be shown: nothing left to keep. Only
  // while still on this step, so letting go of the seal on the way out never redirects anything.
  useEffect(() => {
    if (!key && phase === "keeping") setPhase("submitted");
  }, [key, phase, setPhase]);
  if (!key) return null;

  // On to sealing, still holding the seal: sealing checks one of its groups and confirms it.
  function goSeal() {
    setPhase("sealing");
  }

  // The seal leaves memory: the trace is left, it just never receives letters.
  function leaveWithoutLetters() {
    setKey(null);
    setLastAsked(null);
    setPhase("submitted");
  }

  return (
    <KeepReturnKeyStep
      returnKey={key.returnKey}
      sentence={key.sentence}
      // Back from sealing to look at the seal again: it was already kept once.
      alreadyKept={lastAsked !== null}
      body={t("keep.body")}
      leaveLabel={t("keep.withoutLetters")}
      onKept={goSeal}
      onLeave={leaveWithoutLetters}
    />
  );
}

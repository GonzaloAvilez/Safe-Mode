"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useResetRitual } from "@/app/_components/experience-state/providers";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { ScreenCta } from "../../_shared/screen-cta";
import { ScreenHeader } from "../../_shared/screen-header";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { GratitudeCanvas } from "../../gratitude/gratitude-canvas";
import { LetterNotificationsToggle } from "../../_shared/notifications/letter-notifications-toggle";
import { KeepTraceSealStep } from "./keep-trace-seal-step";
import { LettersChoiceStep } from "./letters-choice-step";
import { TraceForm } from "./trace-form";

// The quiet scene every step before the closing shares: a soft glow, the tagline, content in the middle.
// A step taller than the phone starts lower (`spacing`), so its content never sits under the
// header and the sound toggle, which stay fixed at the top while the page scrolls.
function TraceStepShell({
  tagline,
  children,
  spacing = "py-24",
}: {
  tagline: string;
  children: ReactNode;
  spacing?: string;
}) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>

      <ScreenHeader tagline={tagline} />

      <div className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 ${spacing}`}>
        {children}
      </div>
    </>
  );
}

// Screen 08/8, the last stop. Draft and resolved phase stay in ephemeral memory so
// changing locale cannot erase the visitor's choice or vulnerable text.
//
// With letters open (ADR-004 #212) the way to the closing has two steps more for whoever wants
// them: writing → choosing (letters or not) → keeping (the seal, which also confirms it) → the
// closing, with one more line for whoever sealed it. `lettersOpen` is read
// by the page on every visit, and the server decides again when the phrase arrives, so a switch
// that closes meanwhile never leaves someone with a seal that opens nothing.
export function LeaveATraceScreen({ lettersOpen }: { lettersOpen: boolean }) {
  const t = useTranslations("leaveATrace");
  const { leaveATracePhase: phase, setLeaveATracePhase: setPhase, leaveATraceKey } = useRitualState();
  const resetRitual = useResetRitual();

  if (phase === "choosing") {
    return (
      <TraceStepShell tagline={t("writingTagline")}>
        <LettersChoiceStep />
      </TraceStepShell>
    );
  }

  if (phase === "keeping") {
    return (
      <TraceStepShell tagline={t("keep.tagline")} spacing="pt-40 pb-16">
        <KeepTraceSealStep />
      </TraceStepShell>
    );
  }

  if (phase !== "writing") {
    const doneHeadlineLines = t("doneHeadline").split("\n");
    // ADR-005: whoever sealed it waits for a first letter that may never come, so this is where
    // letter notices are offered, with the seal still in memory.
    const offersNotices = phase === "sealed" && leaveATraceKey !== null;

    return (
      <>
        <GratitudeCanvas />

        <ScreenHeader tagline={t("doneTagline")} />

        {/* With the notices offered, the centered words leave room at the bottom for "Volver al
            inicio", which stays fixed there: on a short phone they'd otherwise meet. */}
        <div
          className={`pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8 ${offersNotices ? "pb-16" : ""}`}
        >
          <ScreenPrompt
            className="translate-y-[6vh]"
            headline={
              <>
                {doneHeadlineLines[0]}
                <br />
                {doneHeadlineLines[1]}
                <br />
                {doneHeadlineLines[2]}
              </>
            }
            subcopy={
              phase === "skipped" ? (
                t("skippedSubcopy")
              ) : phase === "sealed" ? (
                // Two sentences, two lines: what the seal does, then where the mailbox is.
                t("sealedSubcopy")
                  .split("\n")
                  .map((line, index) => (
                    <span key={index} className="block">
                      {line}
                    </span>
                  ))
              ) : undefined
            }
          />
          {offersNotices && (
            <LetterNotificationsToggle returnKey={leaveATraceKey.returnKey} className="pointer-events-auto mt-6 translate-y-[6vh]" />
          )}
        </div>

        <ScreenCta href="/" label={t("backToStart")} accentRgb="210,158,32" onClick={resetRitual} />
      </>
    );
  }

  return (
    <TraceStepShell tagline={t("writingTagline")}>
      <ScreenPrompt headline={t("writingHeadline")} subcopy={t("writingSubcopy")} />

      <TraceForm lettersOpen={lettersOpen} onResolved={setPhase} />
    </TraceStepShell>
  );
}

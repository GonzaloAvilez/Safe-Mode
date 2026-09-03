"use client";

import { useTranslations } from "next-intl";
import { useResetRitual } from "@/app/_components/experience-state/providers";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { ScreenCta } from "../../_shared/screen-cta";
import { ScreenHeader } from "../../_shared/screen-header";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { GratitudeCanvas } from "../../gratitude/gratitude-canvas";
import { TraceForm } from "./trace-form";

// Screen 08/8, the last stop. Draft and resolved phase stay in ephemeral memory so
// changing locale cannot erase the visitor's choice or vulnerable text.
export function LeaveATraceScreen() {
  const t = useTranslations("leaveATrace");
  const { leaveATracePhase: phase, setLeaveATracePhase: setPhase } = useRitualState();
  const resetRitual = useResetRitual();

  if (phase !== "writing") {
    const doneHeadlineLines = t("doneHeadline").split("\n");

    return (
      <>
        <GratitudeCanvas />

        <ScreenHeader tagline={t("doneTagline")} />

        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
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
            subcopy={phase === "skipped" ? t("skippedSubcopy") : undefined}
          />
        </div>

        <ScreenCta href="/" label={t("backToStart")} accentRgb="210,158,32" onClick={resetRitual} />
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>

      <ScreenHeader tagline={t("writingTagline")} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 py-24">
        <ScreenPrompt headline={t("writingHeadline")} subcopy={t("writingSubcopy")} />

        <TraceForm onResolved={setPhase} />
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { GratitudeCanvas } from "../gratitude/gratitude-canvas";
import { TraceForm } from "./_components/trace-form";

type Phase = "writing" | "submitted" | "skipped";

// Screen 08/8, the last stop. Two visually distinct halves: while writing, it's calm
// and input-focused (a static gradient glow, reusing Write's own textarea spec per
// explicit direction — no canvas competing with the textarea for attention). Once
// resolved, it becomes the rich closing moment the 2026-07-12 mockup actually
// specified for this screen — Gratitude's dense multicolor corpus and its "the
// ecosystem now includes you" copy — which the first pass of this screen skipped
// in favor of a bare text swap.
export default function LeaveATracePage() {
  const [phase, setPhase] = useState<Phase>("writing");

  if (phase !== "writing") {
    return (
      <>
        <GratitudeCanvas />

        <ScreenHeader tagline="The cycle closes." />

        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
          <ScreenPrompt
            className="translate-y-[6vh]"
            headline={
              <>
                Your presence is now
                <br />
                also part
                <br />
                of this ecosystem.
              </>
            }
            subcopy={phase === "skipped" ? "And leaving nothing is also a way of being here." : undefined}
          />
        </div>

        <ScreenCta href="/" label="Back to start" accentRgb="210,158,32" />
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>

      <ScreenHeader tagline="Your presence also transforms this place." />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 py-24">
        <ScreenPrompt
          headline="Leave something for whoever arrives next."
          subcopy="It doesn't have to be deep. Someone else will find it, just like you found someone else's."
        />

        <TraceForm onResolved={setPhase} />
      </div>
    </>
  );
}

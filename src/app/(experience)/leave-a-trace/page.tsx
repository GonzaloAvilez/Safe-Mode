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

        <ScreenHeader tagline="El ciclo cierra." />

        <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
          <ScreenPrompt
            className="translate-y-[6vh]"
            headline={
              <>
                Tu presencia ahora
                <br />
                también forma parte
                <br />
                de este ecosistema.
              </>
            }
            subcopy={phase === "skipped" ? "Y no dejar nada también es una forma de estar aquí." : undefined}
          />
        </div>

        <ScreenCta href="/" label="volver al inicio" accentRgb="210,158,32" />
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>

      <ScreenHeader tagline="Tu presencia también transforma este lugar." />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 py-24">
        <ScreenPrompt
          headline="Deja algo para quien llegue después."
          subcopy="No tiene que ser profundo. Alguien más lo va a encontrar, así como vos encontraste lo de otro."
        />

        <TraceForm onResolved={setPhase} />
      </div>
    </>
  );
}

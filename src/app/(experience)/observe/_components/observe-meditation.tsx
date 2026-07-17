"use client";

import { useEffect, useState } from "react";
import { AmbientGlowBackground } from "../../_shared/ambient-glow-background";
import { ScreenHeader } from "../../_shared/screen-header";

const INHALE_MS = 4000;
const EXHALE_MS = 4000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Static fallback shown when /observe's data fetch fails or times out — the flow never
// dead-ends into a bare error message. ObserveScreen keeps retrying the fetch in the
// background while this is up; readyToResume flips true once that succeeds, and the
// visitor is invited to continue rather than being swapped out from under them.
export function ObserveMeditation({
  readyToResume,
  onResume,
}: {
  readyToResume: boolean;
  onResume: () => void;
}) {
  const [inhaling, setInhaling] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(
      () => setInhaling((v) => !v),
      inhaling ? INHALE_MS : EXHALE_MS
    );
    return () => window.clearInterval(id);
  }, [inhaling]);

  return (
    <div className="fixed inset-0 z-30">
      <AmbientGlowBackground />
      <ScreenHeader tagline="A moment to breathe." />

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-8 px-8 text-center">
        <div
          className="h-24 w-24 rounded-full border border-[rgba(200,160,30,0.3)] bg-[rgba(200,160,30,0.08)]"
          style={{
            transform: `scale(${inhaling ? 1.15 : 0.85})`,
            transition: prefersReducedMotion()
              ? "none"
              : `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
          }}
        />

        <div className="max-w-[300px] text-[13px] leading-[1.9] tracking-[.3px] text-white/45">
          {inhaling ? "Breathe in..." : "Breathe out..."}
        </div>

        <div className="max-w-[280px] text-[12px] leading-[1.8] tracking-[.3px] text-white/30">
          {readyToResume
            ? "Your refuge is ready."
            : "We're taking longer than usual to connect. Stay here a moment, or come back later."}
        </div>

        {readyToResume && (
          <button
            type="button"
            onClick={onResume}
            className="rounded-full border border-[rgba(200,160,30,0.4)] px-6 py-2 text-[11px] tracking-[1.5px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.7)] hover:text-white/85"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

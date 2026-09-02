"use client";

import { useEffect, useState } from "react";

// Two blurred, fixed radial-gradient layers behind the page — one drifts slowly and
// permanently (the `.ambient-drift` keyframe in globals.css), the other blooms on an
// autonomous random interval and eases back out, giving the page a "breathing"
// quality on its own. Ported from the "Ding — meditaciones generativas en handpan"
// prototype's ambient background technique (blur + transform/opacity transitions
// toggled by an active state) minus its note-driven trigger — this page doesn't wire
// up the handpan audio module, so the pulse is decorative/autonomous for now.
const PULSE_DELAY_RANGE_MS: [number, number] = [3800, 7200];
const BIG_PULSE_CHANCE = 0.18;

type PulseState = "idle" | "small" | "big";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AmbientGlowBackground() {
  const [pulse, setPulse] = useState<PulseState>("idle");

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let scheduleId: ReturnType<typeof setTimeout>;
    let resetId: ReturnType<typeof setTimeout>;

    function schedule() {
      const [min, max] = PULSE_DELAY_RANGE_MS;
      scheduleId = setTimeout(() => {
        setPulse(Math.random() < BIG_PULSE_CHANCE ? "big" : "small");
        resetId = setTimeout(() => setPulse("idle"), 70);
        schedule();
      }, min + Math.random() * (max - min));
    }

    schedule();
    return () => {
      clearTimeout(scheduleId);
      clearTimeout(resetId);
    };
  }, []);

  const isActive = pulse !== "idle";
  const scale = pulse === "big" ? 1.38 : pulse === "small" ? 1.22 : 0.9;
  const opacity = pulse === "big" ? 0.34 : pulse === "small" ? 0.26 : 0.07;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden blur-[70px]">
      <div
        className="ambient-drift absolute inset-[-15%] rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(200,160,30,0.5), transparent 60%)",
          opacity: 0.12,
        }}
      />
      <div
        className="absolute inset-[-15%] rounded-full"
        style={{
          background: "radial-gradient(circle at 68% 64%, rgba(140,180,130,0.6), transparent 55%)",
          opacity,
          transform: `scale(${scale})`,
          transition: isActive
            ? "transform 80ms ease-out, opacity 80ms ease-out"
            : "transform 2600ms cubic-bezier(0.22,1,0.36,1), opacity 2600ms ease-out",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

// Screen positions for where a phrase can appear, kept away from the header (top-left),
// the fixed CTA (bottom-center), and — with a 180px max-width text block centered on
// each point — far enough from the left/right edges to never clip on narrow viewports
// (verified down to 375px).
const SLOTS = [
  { top: "24%", left: "32%" },
  { top: "34%", left: "62%" },
  { top: "50%", left: "38%" },
  { top: "58%", left: "58%" },
  { top: "42%", left: "50%" },
];

const HOLD_MS = 3400;
const GAP_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The home page's only "explanation" of what Refugio is: real excerpted phrases from
// the actual corpus (same table Observe reads from), appearing and fading one at a
// time — evidence instead of a description, per the "never presume/explain, just show
// what's real" principle already established for the rest of this flow.
export function LivingPhrases({ phrases }: { phrases: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (phrases.length <= 1 || reduced) return;

    let holdId: ReturnType<typeof setTimeout>;
    let gapId: ReturnType<typeof setTimeout>;

    function cycle() {
      holdId = setTimeout(() => {
        setVisible(false);
        gapId = setTimeout(() => {
          setIndex((i) => (i + 1) % phrases.length);
          setVisible(true);
          cycle();
        }, GAP_MS);
      }, HOLD_MS);
    }

    cycle();
    return () => {
      clearTimeout(holdId);
      clearTimeout(gapId);
    };
  }, [phrases.length, reduced]);

  if (phrases.length === 0) return null;

  const slot = SLOTS[index % SLOTS.length];

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]">
      <p
        className="absolute max-w-[180px] -translate-x-1/2 text-center text-[13px] leading-[1.6] tracking-[.2px] text-white/55 italic transition-opacity duration-[1400ms]"
        style={{ top: slot.top, left: slot.left, opacity: reduced ? 1 : visible ? 1 : 0 }}
      >
        &ldquo;{phrases[index]}&rdquo;
      </p>
    </div>
  );
}

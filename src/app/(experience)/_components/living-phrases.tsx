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

// "23 minutes ago" instead of an absolute date — a real submission time reads as more
// alive/recent this way, and it matches how the rest of the app already speaks (English,
// resolved 2026-07-15).
function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, "hour");
  return rtf.format(-Math.round(diffHours / 24), "day");
}

export type LivingPhraseItem = {
  text: string;
  // Both only ever set together, by the public-narrative experiment (see
  // docs/workshop-updates) when its flag is on — absent otherwise, in which case
  // this renders exactly as before: just the phrase text.
  publicNarrative?: string;
  createdAt?: string;
};

// The home page's only "explanation" of what Refugio is: real excerpted phrases from
// the actual corpus (same table Observe reads from), appearing and fading one at a
// time — evidence instead of a description, per the "never presume/explain, just show
// what's real" principle already established for the rest of this flow.
export function LivingPhrases({ phrases }: { phrases: LivingPhraseItem[] }) {
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
  const current = phrases[index];

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]">
      <div
        className="absolute max-w-[180px] -translate-x-1/2 text-center transition-opacity duration-[1400ms]"
        style={{ top: slot.top, left: slot.left, opacity: reduced ? 1 : visible ? 1 : 0 }}
      >
        <p className="text-[13px] leading-[1.6] tracking-[.2px] text-white/55 italic">&ldquo;{current.text}&rdquo;</p>
        {current.publicNarrative && (
          <p className="mt-1 text-[11px] leading-[1.5] text-white/40">{current.publicNarrative}</p>
        )}
        {current.createdAt && (
          <p className="mt-1 text-[10px] tracking-[.3px] text-white/25">{formatRelativeTime(current.createdAt)}</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

// Screen positions for where a phrase can appear, spread across most of the viewport
// instead of one small central cluster — kept away from the header (top-left, ~top-10),
// the sound toggle (top-right, ~top-24/top-10 depending on breakpoint), and the fixed
// CTA (bottom-center). Horizontal clipping on narrow viewports is handled separately by
// the clamp() in the render below, which is what actually makes positions this close to
// the edges safe — these percentages alone would clip a 240px-wide box on a 375px phone.
const SLOTS = [
  { top: "20%", left: "15%" },
  { top: "24%", left: "50%" },
  { top: "30%", left: "82%" },
  { top: "38%", left: "25%" },
  { top: "44%", left: "65%" },
  { top: "50%", left: "12%" },
  { top: "54%", left: "45%" },
  { top: "56%", left: "78%" },
];

// Half the phrase box's max-width (240px) plus a small buffer — the min/max bounds a
// slot's left percentage gets clamped into, so a box centered via -translate-x-1/2 never
// clips off either edge regardless of viewport width. Replaces the old approach (keeping
// every SLOT itself within a narrow 32%-68% band) which was the actual reason positions
// used to read as clustered in the center rather than spread across the screen.
const LEFT_CLAMP_PX = 130;

// Same idea, vertically. A percentage-only top clips on short viewports in a way the
// horizontal clamp doesn't cover: caught live on a 375x568 viewport, where a 20% top
// (114px) landed inside the sound toggle's own box (top-24, ~96-132px, since sm: hasn't
// kicked in yet at that width). 150px clears both the header and the toggle on any
// viewport width; the bottom-side 220px leaves room for the tallest phrase block
// (quote + narrative + date) plus the fixed CTA.
const TOP_CLAMP_MIN_PX = 150;
const TOP_CLAMP_BOTTOM_BUFFER_PX = 220;

// Slowed from 3400ms, 2026-08-02: with the narrative/date lines and the arrival flash
// now part of what there is to take in, the old pace read as rushed — there's more to
// actually spend time with per phrase than there used to be.
const HOLD_MS = 5600;
const GAP_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// "23 minutes ago" instead of an absolute date — a real submission time reads as more
// alive/recent this way, and it matches how the rest of the app already speaks (English,
// resolved 2026-07-15).
function formatRelativeTime(iso: string, locale: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, "hour");
  return rtf.format(-Math.round(diffHours / 24), "day");
}

export type LivingPhraseItem = {
  text: string;
  // Set independently, both by the public-narrative experiment (see
  // docs/workshop-updates) when its flag is on — absent otherwise, in which case this
  // renders exactly as before: just the phrase text. publicNarrative and createdAt are
  // both shown for any active, classified phrase regardless of source (seed included
  // as of 2026-08-04) — it's the date whoever wrote it dared to share it, not a
  // synthetic placeholder that needs hiding.
  publicNarrative?: string;
  createdAt?: string;
};

function randomStartIndex(length: number): number {
  return length > 0 ? Math.floor(Math.random() * length) : 0;
}

// Picks a fresh random phrase on every transition (never repeating the one just
// shown) rather than a fixed sequential order or a once-shuffled one — real feedback
// (2026-08-02) was that the same order every visit read as a repetitive pattern, and
// staying long enough to complete one lap of a once-shuffled order would eventually
// hit that same wall. This never settles into a repeating sequence at all.
function nextRandomIndex(length: number, current: number): number {
  if (length <= 1) return 0;
  const next = Math.floor(Math.random() * (length - 1));
  return next < current ? next : next + 1;
}

// The home page's only "explanation" of what Refugio is: real excerpted phrases from
// the actual corpus (same table Observe reads from), appearing and fading one at a
// time — evidence instead of a description, per the "never presume/explain, just show
// what's real" principle already established for the rest of this flow.
export function LivingPhrases({ phrases }: { phrases: LivingPhraseItem[] }) {
  const locale = useLocale();
  const [index, setIndex] = useState(() => randomStartIndex(phrases.length));
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
          setIndex((i) => nextRandomIndex(phrases.length, i));
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
        className="absolute max-w-[240px] -translate-x-1/2 text-center transition-opacity duration-[1400ms]"
        style={{
          top: `clamp(${TOP_CLAMP_MIN_PX}px, ${slot.top}, calc(100% - ${TOP_CLAMP_BOTTOM_BUFFER_PX}px))`,
          left: `clamp(${LEFT_CLAMP_PX}px, ${slot.left}, calc(100% - ${LEFT_CLAMP_PX}px))`,
          opacity: reduced ? 1 : visible ? 1 : 0,
        }}
      >
        <p
          key={index}
          className="phrase-flash text-[length:var(--text-quote-primary)] leading-[1.5] tracking-[.2px] text-white/55 italic"
        >
          &ldquo;{current.text}&rdquo;
        </p>
        {current.publicNarrative && (
          <p className="mt-1.5 text-right text-[length:var(--text-quote-secondary)] leading-[1.4] text-white/40">
            {current.publicNarrative}
          </p>
        )}
        {current.createdAt && (
          <p className="mt-1.5 text-right text-[13px] tracking-[.3px] text-white/25">
            {formatRelativeTime(current.createdAt, locale)}
          </p>
        )}
      </div>
    </div>
  );
}

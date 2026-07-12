"use client";

import Link from "next/link";
import { forwardRef, type CSSProperties } from "react";

type ScreenCtaProps = {
  href: string;
  label: string;
  // RGB triplet, no alpha and no "rgba(...)" wrapper (e.g. "200,160,30") — the
  // component builds both the resting and hover-state colors for the ring and the
  // inner dot from this one value, so each screen only has to say its color once.
  accentRgb: string;
};

// Forwards its ref to the underlying <a> so Observe's canvas can still measure this
// button's bounding box for the particle field's UI-exclusion zone.
export const ScreenCta = forwardRef<HTMLAnchorElement, ScreenCtaProps>(function ScreenCta(
  { href, label, accentRgb },
  ref
) {
  return (
    <Link
      ref={ref}
      href={href}
      style={{ "--cta-rgb": accentRgb } as CSSProperties}
      className="group/enter fixed bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-transparent transition-all duration-400 group-hover/enter:scale-110 group-hover/enter:border-[rgba(var(--cta-rgb),0.7)]">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(var(--cta-rgb),0.55)] transition-colors group-hover/enter:bg-[rgba(var(--cta-rgb),0.9)]" />
      </span>
      <span className="text-[10px] tracking-[1.5px] text-white/22">{label}</span>
    </Link>
  );
});

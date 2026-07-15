// The headline+subcopy text block repeated across every screen's page.tsx, each with
// its own hand-rolled className that drifted apart over time (mt-2 vs mt-3 vs mt-4,
// white/78 vs white/82, 12px vs 13px subcopy...). Arrive's original scale is now the
// one standard — not just Arrive's own — so every screen inherits it instead of
// re-declaring it. Positioning (fixed overlay vs. inline flow, translate offset) stays
// in each page.tsx via `className`, since that's genuinely screen-specific.
export function ScreenPrompt({
  headline,
  subcopy,
  className,
}: {
  headline: React.ReactNode;
  subcopy?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center ${className ?? ""}`}>
      <div className="text-[22px] font-light tracking-[5px] text-white/82">{headline}</div>
      {subcopy && (
        <div className="mx-auto mt-4 max-w-[360px] text-[13px] leading-[1.9] tracking-[.3px] text-white/50">
          {subcopy}
        </div>
      )}
    </div>
  );
}

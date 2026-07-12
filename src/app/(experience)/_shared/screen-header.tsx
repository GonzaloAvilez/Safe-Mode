// The title block repeated verbatim (only the tagline changed) across every screen's
// page.tsx, plus once more inline inside Observe's canvas component instead of its
// page — pulled into one place so the header markup only exists once.
export function ScreenHeader({ tagline }: { tagline: string }) {
  return (
    <div className="fixed top-10 left-12 z-10">
      <div className="text-[22px] font-light tracking-[5px] text-white/82">Refugio[Safe Mode]</div>
      <div className="mt-1 text-[11px] tracking-[2.5px] text-white/25">{tagline}</div>
    </div>
  );
}

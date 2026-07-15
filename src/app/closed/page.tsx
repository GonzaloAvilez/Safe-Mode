// Reached via proxy.ts's redirect whenever the site_public setting is off. Deliberately
// bare — no branding flourish, no explanation of when it'll be back — since anyone
// landing here got redirected involuntarily, not by choosing to read about the project.
export default function ClosedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0a0c10] px-8 text-center text-white">
      <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/45">Not open to the public yet.</p>
    </div>
  );
}

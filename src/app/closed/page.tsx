import { redirect } from "next/navigation";
import { isSitePublic } from "@/lib/settings";

// Reached via proxy.ts's redirect whenever the site_public setting is off. Deliberately
// bare — no branding flourish, no explanation of when it'll be back — since anyone
// landing here got redirected involuntarily, not by choosing to read about the project.
//
// /closed stays reachable even while the site is public (proxy.ts's own
// ALWAYS_ALLOWED_PREFIXES, so the redirect target itself never loops) — but a stale
// bookmark or shared link pointing straight here shouldn't show "not open yet" once
// the site actually is. Hotfix 2026-08-02.
export default async function ClosedPage() {
  if (await isSitePublic()) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0a0c10] px-8 text-center text-white">
      <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/45">Not open to the public yet.</p>
    </div>
  );
}

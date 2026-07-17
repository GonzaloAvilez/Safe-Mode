"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { readMirrorHandoff, type MirrorHandoff } from "../_shared/mirror-handoff";
import { playRandomNote } from "../_shared/handpan-audio";
import { MirrorCanvas } from "./mirror-canvas";
import { QuoteReveal } from "./_components/quote-reveal";

// The node kept barely lit rather than gone for no_match — nobody's presence gets
// erased for not matching, there's just no specific phrase behind it yet.
const NO_MATCH_OTHER_INTENSITY = 0.12;

// Reachable after either Write outcome that isn't a safety/capacity exception —
// "matched" (a phrase to show) and "no_match" (still passes through here rather
// than dead-ending in Write). Write stashes which one in sessionStorage before
// navigating; a direct visit has nothing to read, so it bounces back to Write.
export default function MirrorPage() {
  const router = useRouter();
  const [handoff] = useState<MirrorHandoff | null>(readMirrorHandoff);
  const [resonated, setResonated] = useState(false);

  useEffect(() => {
    if (!handoff) {
      router.replace("/write");
    }
  }, [handoff, router]);

  if (!handoff) {
    return null;
  }

  const matched = handoff.outcome === "matched";

  // A toggle, not a one-way flag — tapping again undoes it. That's the only signal
  // available for "that tap was an accident": no confirmation dialog, since one
  // would fight the quiet, unforced tone the rest of the flow keeps.
  async function handleResonate() {
    const next = !resonated;
    setResonated(next);
    if (next) playRandomNote();
    if (handoff!.outcome !== "matched") return;
    try {
      await fetch(`/api/entries/${handoff!.entryId}/resonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
    } catch {
      // Best-effort — a quiet gesture, not worth surfacing a retry UI for.
    }
  }

  return (
    <>
      <MirrorCanvas otherIntensity={matched ? 1 : NO_MATCH_OTHER_INTENSITY} />

      <ScreenHeader tagline={matched ? "Someone felt this too." : "Your presence stayed here."} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2 px-8 pt-[26vh] text-center">
        <div className="w-full max-w-[360px] rounded-lg border border-white/[0.06] bg-white/[0.03] px-6 py-6">
          {matched ? (
            <>
              <div className="font-serif text-[26px] leading-none text-[rgba(200,160,200,0.45)]">&ldquo;</div>
              <p className="mt-1 text-[15px] leading-[1.8] tracking-[.2px] text-white/72 italic">
                <QuoteReveal text={handoff.text} />
              </p>
              <div className="mt-3 text-[11px] tracking-[.5px] text-white/25">— someone in this place</div>
            </>
          ) : (
            <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/35">
              No one has felt exactly this yet.
            </p>
          )}
        </div>

        <div className="mt-6 max-w-[280px] text-[12px] leading-[1.8] tracking-[.3px] text-white/45">
          {matched
            ? "You're not the first person who felt this."
            : "Your presence stayed here, waiting to meet someone else's."}
        </div>

        {matched && (
          <button
            type="button"
            onClick={handleResonate}
            aria-pressed={resonated}
            className={`mt-4 rounded-full border px-5 py-1.5 text-[11px] tracking-[.5px] transition-colors duration-500 ${
              resonated
                ? "border-[rgba(165,125,220,0.55)] text-[rgba(200,175,255,0.85)]"
                : "border-[rgba(165,125,220,0.3)] text-[rgba(165,125,220,0.6)] hover:border-[rgba(165,125,220,0.5)]"
            }`}
          >
            This resonated with me
          </button>
        )}
      </div>

      <ScreenCta href="/gratitude" label="Continue" accentRgb="170,130,230" />
    </>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ScreenCta } from "../../_shared/screen-cta";
import { ScreenHeader } from "../../_shared/screen-header";
import { readMirrorHandoff } from "../../_shared/mirror-handoff";
import { playRandomNote } from "../../_shared/handpan-audio";
import { MirrorCanvas } from "../mirror-canvas";
import { QuoteReveal } from "./quote-reveal";

// The node kept barely lit rather than gone for no_match — nobody's presence gets
// erased for not matching, there's just no specific phrase behind it yet.
const NO_MATCH_OTHER_INTENSITY = 0.12;

// The handoff is set once in sessionStorage before Write navigates here and never
// changes again during Mirror's lifetime, so there's nothing to actually subscribe
// to — same reasoning as home-gate.tsx's useSyncExternalStore usage, minus the
// change-event wiring that store actually needs.
function subscribeToHandoff() {
  return () => {};
}

// Server (and the client's first hydration pass) always sees "no handoff" —
// sessionStorage doesn't exist there. useSyncExternalStore resyncs to the real
// client value right after hydration on its own, without the hydration-mismatch
// risk of reading sessionStorage during a lazy useState initializer or setting
// state in a plain effect (confirmed live 2026-08-02, introduced by splitting this
// screen's page.tsx into a server/client pair — the original single "use client"
// page.tsx never hit this).
function getServerHandoffSnapshot() {
  return null;
}

// Reachable after either Write outcome that isn't a safety/capacity exception —
// "matched" (a phrase to show) and "no_match" (still passes through here rather
// than dead-ending in Write). Write stashes which one in sessionStorage before
// navigating; a direct visit has nothing to read, so it bounces back to Write.
export function MirrorScreen({ resonateEnabled }: { resonateEnabled: boolean }) {
  const t = useTranslations("mirror");
  const tc = useTranslations("common");
  const router = useRouter();
  const handoff = useSyncExternalStore(subscribeToHandoff, readMirrorHandoff, getServerHandoffSnapshot);
  const [resonated, setResonated] = useState(false);
  const [wantsToConnect, setWantsToConnect] = useState(false);

  // Deliberately not keyed on `handoff` — the hydration resync above commits in two
  // steps (server-matching null, then the real client value), and this effect would
  // otherwise fire once per step, redirecting on the first one before the second
  // ever lands. Reading readMirrorHandoff() directly instead of closing over
  // `handoff` sidesteps that: by the time any effect runs here, we're already
  // client-side and past mount, so the real sessionStorage value is what's read
  // regardless of which render triggered it. Runs once, tied only to mount.
  useEffect(() => {
    if (!readMirrorHandoff()) {
      router.replace("/write");
    }
  }, [router]);

  if (!handoff) {
    return null;
  }

  const matched = handoff.outcome === "matched";

  // One-shot, not a toggle — same phrase-level signal as Observe's resonate button
  // (see /api/phrases/[id]/resonate), which never offered an undo either. Once tapped,
  // it stays tapped.
  async function handleResonate() {
    if (resonated || handoff!.outcome !== "matched") return;
    setResonated(true);
    playRandomNote();
    try {
      await fetch(`/api/phrases/${handoff!.phraseId}/resonate`, { method: "POST" });
    } catch {
      // Best-effort — a quiet gesture, not worth surfacing a retry UI for.
    }
  }

  // A toggle, not a one-way flag — tapping again undoes it. That's the only signal
  // available for "that tap was an accident": no confirmation dialog, since one
  // would fight the quiet, unforced tone the rest of the flow keeps.
  async function handleConnect() {
    const next = !wantsToConnect;
    setWantsToConnect(next);
    if (next) playRandomNote();
    if (handoff!.outcome !== "matched") return;
    try {
      await fetch(`/api/entries/${handoff!.entryId}/connect`, {
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

      <ScreenHeader tagline={matched ? t("taglineMatched") : t("taglineNoMatch")} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2 px-8 pt-[26vh] text-center">
        <div
          className="w-full max-w-[360px] rounded-2xl border px-6 py-6 backdrop-blur-sm"
          style={
            matched
              ? {
                  backgroundColor: "rgba(18,15,11,0.72)",
                  borderColor: "rgba(165,125,220,0.28)",
                  boxShadow: "0 0 44px -10px rgba(165,125,220,0.35)",
                }
              : {
                  backgroundColor: "#00000085",
                  borderColor: "rgba(165,125,220,0.14)",
                  boxShadow: "0 0 32px -14px rgba(165,125,220,0.18)",
                }
          }
        >
          {matched ? (
            <>
              <div className="font-serif text-[26px] leading-none text-[rgba(200,160,200,0.45)]">&ldquo;</div>
              <p className="mt-1 text-[length:var(--text-quote-primary)] leading-[1.7] tracking-[.2px] text-white/72 italic">
                <QuoteReveal text={handoff.text} />
              </p>
              <div className="mt-3 text-[length:var(--text-quote-secondary)] tracking-[.5px] text-white/25">
                {t("attribution")}
              </div>

              {resonateEnabled && (
                <button
                  type="button"
                  onClick={handleResonate}
                  disabled={resonated}
                  aria-pressed={resonated}
                  className={`mt-4 rounded-full border px-5 py-1.5 text-[13px] tracking-[.5px] transition-colors duration-500 ${
                    resonated
                      ? "border-[rgba(165,125,220,0.55)] text-[rgba(200,175,255,0.85)]"
                      : "border-[rgba(165,125,220,0.3)] text-[rgba(165,125,220,0.6)] hover:border-[rgba(165,125,220,0.5)]"
                  }`}
                >
                  {resonated ? "💛" : "✨"} {t("resonateButton")}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="font-serif text-[26px] leading-none text-[rgba(165,125,220,0.25)]">·</div>
              <p className="mt-1 text-[length:var(--text-quote-primary)] leading-[1.8] tracking-[.3px] text-white/45">
                <QuoteReveal text={t("noMatchQuote")} />
              </p>
            </>
          )}
        </div>

        <div className="mt-6 max-w-[280px] text-[14px] leading-[1.7] tracking-[.3px] text-white/45">
          {matched ? t("subcopyMatched") : t("subcopyNoMatch")}
        </div>

        {matched && (
          <button
            type="button"
            onClick={handleConnect}
            aria-pressed={wantsToConnect}
            className={`mt-4 rounded-full border px-5 py-1.5 text-[13px] tracking-[.5px] transition-all duration-300 hover:scale-105 active:scale-95 ${
              wantsToConnect
                ? "border-[rgba(200,160,30,0.55)] bg-[rgba(200,160,30,0.12)] text-[rgba(248,225,150,0.9)]"
                : "border-[rgba(200,160,30,0.3)] bg-[rgba(200,160,30,0.06)] text-[rgba(200,160,30,0.75)] hover:border-[rgba(200,160,30,0.55)] hover:bg-[rgba(200,160,30,0.12)]"
            }`}
          >
            {wantsToConnect ? "💛" : "🤍"} {t("connectButton")}
          </button>
        )}
      </div>

      <ScreenCta href="/gratitude" label={tc("continue")} accentRgb="170,130,230" />
    </>
  );
}

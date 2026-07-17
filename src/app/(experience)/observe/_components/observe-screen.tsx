"use client";

import { useEffect, useState } from "react";
import { ScreenHeader } from "../../_shared/screen-header";
import { ObserveCanvas } from "../observe-canvas";
import { ObserveTransition } from "./observe-transition";
import { ObserveMeditation } from "./observe-meditation";

type Phrase = { id: string; text: string };
type ObserveData = { phrases: Phrase[]; similarities: number[][] };
type FetchState = "loading" | "ready" | "error";

const INITIAL_TIMEOUT_MS = 10000;
const RETRY_INTERVAL_MS = 6000;

// Orchestrates the handoff from /arrive: the ritual transition always plays to
// completion regardless of how long /api/observe takes, and the real canvas only
// mounts once both the ritual and the fetch are done — whichever finishes last. A
// fetch that fails or times out falls through to a static meditation screen instead
// of a dead end, retried silently in the background; see observe-meditation.tsx for
// how a recovery mid-meditation is offered rather than forced.
export function ObserveScreen() {
  const [animationDone, setAnimationDone] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [data, setData] = useState<ObserveData | null>(null);
  const [showMeditation, setShowMeditation] = useState(false);

  // Whether the meditation fallback should trigger this render — latched below rather
  // than in an effect, since a later retry succeeding must not un-trigger it; only
  // ObserveMeditation's onResume can turn showMeditation back off.
  const meditationTriggered = animationDone && fetchState === "error";
  const [committedMeditationTriggered, setCommittedMeditationTriggered] = useState(meditationTriggered);

  useEffect(() => {
    let cancelled = false;
    let attempting = false;
    let retryId: ReturnType<typeof setInterval> | null = null;

    async function attempt(timeoutMs: number | null) {
      if (attempting) return;
      attempting = true;

      const controller = timeoutMs ? new AbortController() : undefined;
      const timeoutId = timeoutMs ? window.setTimeout(() => controller!.abort(), timeoutMs) : null;

      try {
        const res = await fetch("/api/observe", { signal: controller?.signal });
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) throw new Error("server error");
        const body = (await res.json()) as ObserveData;
        if (cancelled) return;

        setData(body);
        setFetchState("ready");
        if (retryId) {
          clearInterval(retryId);
          retryId = null;
        }
      } catch {
        if (timeoutId) clearTimeout(timeoutId);
        if (cancelled) return;

        setFetchState("error");
        if (!retryId) {
          retryId = setInterval(() => attempt(null), RETRY_INTERVAL_MS);
        }
      } finally {
        attempting = false;
      }
    }

    attempt(INITIAL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (retryId) clearInterval(retryId);
    };
  }, []);

  // Adjusting state during render (React's recommended alternative to an effect here:
  // https://react.dev/learn/you-might-not-need-an-effect) — fires exactly once, the
  // render where meditationTriggered first flips true.
  if (meditationTriggered !== committedMeditationTriggered) {
    setCommittedMeditationTriggered(meditationTriggered);
    if (meditationTriggered) {
      setShowMeditation(true);
    }
  }

  const outcomeReady = animationDone && fetchState !== "loading";

  if (!outcomeReady) {
    return <ObserveTransition onComplete={() => setAnimationDone(true)} />;
  }

  if (showMeditation) {
    return <ObserveMeditation readyToResume={fetchState === "ready"} onResume={() => setShowMeditation(false)} />;
  }

  if (data) {
    return (
      <>
        <ObserveCanvas phrases={data.phrases} similarities={data.similarities} />
        <ScreenHeader tagline="Ecosystem of presences" />
      </>
    );
  }

  return null;
}

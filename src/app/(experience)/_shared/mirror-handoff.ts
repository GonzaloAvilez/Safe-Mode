// Write stashes this right before navigating to Mirror, for either outcome that
// reaches Mirror — "matched" (a phrase to show) and "no_match" (nothing to show yet,
// but the visitor still passes through Mirror rather than dead-ending in Write).
// Shared so the two sides of the handoff can't drift into mismatched key/shape.
const MIRROR_HANDOFF_KEY = "sm:mirrorHandoff";

export type MirrorHandoff =
  | { outcome: "matched"; text: string; entryId: string; phraseId: string }
  | { outcome: "no_match"; entryId: string };

export function writeMirrorHandoff(handoff: MirrorHandoff): void {
  try {
    window.sessionStorage.setItem(MIRROR_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Mirror degrades to bouncing back to Write when it can't read this back.
  }
}

// Memoized once window exists, so repeated calls return the same reference rather
// than a fresh JSON.parse result each time — required for useSyncExternalStore
// (mirror-screen.tsx) to see a stable snapshot instead of "changed" on every render.
// Never cached on the server: that branch must stay live per-request, not shared
// across requests via module scope.
let cachedHandoff: MirrorHandoff | null | undefined;

export function readMirrorHandoff(): MirrorHandoff | null {
  if (typeof window === "undefined") return null;
  if (cachedHandoff !== undefined) return cachedHandoff;

  try {
    const raw = window.sessionStorage.getItem(MIRROR_HANDOFF_KEY);
    if (!raw) return (cachedHandoff = null);
    const parsed = JSON.parse(raw);
    if (
      parsed?.outcome === "matched" &&
      typeof parsed.text === "string" &&
      typeof parsed.entryId === "string" &&
      typeof parsed.phraseId === "string"
    ) {
      return (cachedHandoff = parsed);
    }
    if (parsed?.outcome === "no_match" && typeof parsed.entryId === "string") {
      return (cachedHandoff = parsed);
    }
    return (cachedHandoff = null);
  } catch {
    return (cachedHandoff = null);
  }
}

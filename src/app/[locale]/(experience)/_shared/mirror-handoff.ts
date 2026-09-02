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
    // Keeps the in-memory cache below in sync with what was just written — without
    // this, a second Write submission in the same client-side session (e.g. the
    // visitor hit the browser's back button rather than a full reload) would leave
    // readMirrorHandoff() serving the *first* handoff it ever read, forever, since
    // the module stays loaded across client-side navigations. Confirmed live
    // 2026-08-07: a real second match was written to sessionStorage correctly, but
    // Mirror kept rendering the first entry's no_match state.
    cachedHandoff = handoff;
  } catch {
    // Write failed — don't keep serving a stale success from before it. The next
    // read re-checks sessionStorage directly instead of trusting old in-memory state.
    cachedHandoff = undefined;
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

// Write stashes this right before navigating to Mirror, for either outcome that
// reaches Mirror — "matched" (a phrase to show) and "no_match" (nothing to show yet,
// but the visitor still passes through Mirror rather than dead-ending in Write).
// Shared so the two sides of the handoff can't drift into mismatched key/shape.
const MIRROR_HANDOFF_KEY = "sm:mirrorHandoff";

export type MirrorHandoff =
  | { outcome: "matched"; text: string; entryId: string }
  | { outcome: "no_match"; entryId: string };

export function writeMirrorHandoff(handoff: MirrorHandoff): void {
  try {
    window.sessionStorage.setItem(MIRROR_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Mirror degrades to bouncing back to Write when it can't read this back.
  }
}

export function readMirrorHandoff(): MirrorHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(MIRROR_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.outcome === "matched" && typeof parsed.text === "string" && typeof parsed.entryId === "string") {
      return parsed;
    }
    if (parsed?.outcome === "no_match" && typeof parsed.entryId === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

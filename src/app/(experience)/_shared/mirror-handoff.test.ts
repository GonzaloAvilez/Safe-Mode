import { afterEach, describe, expect, it, vi } from "vitest";

// This suite runs under vitest's default "node" environment (no jsdom/happy-dom
// installed — see vitest.config.ts), so `window` doesn't exist globally. A minimal
// in-memory stub is enough: the module only ever touches getItem/setItem on
// window.sessionStorage.
function createSessionStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

async function freshModule() {
  vi.resetModules();
  (globalThis as { window?: unknown }).window = { sessionStorage: createSessionStorageStub() };
  return import("./mirror-handoff");
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("readMirrorHandoff / writeMirrorHandoff", () => {
  it("returns null when nothing has been written", async () => {
    const { readMirrorHandoff } = await freshModule();
    expect(readMirrorHandoff()).toBeNull();
  });

  it("returns what was just written", async () => {
    const { writeMirrorHandoff, readMirrorHandoff } = await freshModule();
    writeMirrorHandoff({ outcome: "no_match", entryId: "entry-1" });
    expect(readMirrorHandoff()).toEqual({ outcome: "no_match", entryId: "entry-1" });
  });

  it("memoizes so repeated reads return the same object reference (required by useSyncExternalStore)", async () => {
    const { writeMirrorHandoff, readMirrorHandoff } = await freshModule();
    writeMirrorHandoff({ outcome: "no_match", entryId: "entry-1" });
    expect(readMirrorHandoff()).toBe(readMirrorHandoff());
  });

  // Reproduces the real bug reported 2026-08-07: a first entry with no_match, then
  // (without a full page reload — e.g. the browser's back button, then a fresh
  // submission) a second entry that really did match. Mirror kept showing the first
  // entry's no_match state even though sessionStorage — and the database — had the
  // real match. Root cause: writeMirrorHandoff updated sessionStorage but never
  // invalidated the in-memory cache readMirrorHandoff had already populated, so the
  // memoization guard (`if (cachedHandoff !== undefined) return cachedHandoff`) kept
  // short-circuiting before ever looking at sessionStorage again.
  it("reflects a second write within the same session, not the first one cached", async () => {
    const { writeMirrorHandoff, readMirrorHandoff } = await freshModule();

    writeMirrorHandoff({ outcome: "no_match", entryId: "entry-1" });
    expect(readMirrorHandoff()).toEqual({ outcome: "no_match", entryId: "entry-1" });

    writeMirrorHandoff({ outcome: "matched", text: "a real match", entryId: "entry-2", phraseId: "phrase-1" });
    expect(readMirrorHandoff()).toEqual({
      outcome: "matched",
      text: "a real match",
      entryId: "entry-2",
      phraseId: "phrase-1",
    });
  });

  it("re-reads sessionStorage directly (not a stale cache) after a write fails", async () => {
    const { writeMirrorHandoff, readMirrorHandoff } = await freshModule();

    writeMirrorHandoff({ outcome: "no_match", entryId: "entry-1" });
    expect(readMirrorHandoff()).toEqual({ outcome: "no_match", entryId: "entry-1" });

    (window.sessionStorage as { setItem: unknown }).setItem = () => {
      throw new Error("quota exceeded");
    };
    writeMirrorHandoff({ outcome: "matched", text: "ignored", entryId: "entry-2", phraseId: "phrase-1" });

    // The failed write never landed in sessionStorage, so a fresh read correctly
    // still sees the last real value that made it there — entry-1's no_match — not
    // whatever writeMirrorHandoff was attempting to write.
    expect(readMirrorHandoff()).toEqual({ outcome: "no_match", entryId: "entry-1" });
  });

  it("returns null for malformed sessionStorage content", async () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: { getItem: () => "not json", setItem: () => {} },
    };
    vi.resetModules();
    const { readMirrorHandoff } = await import("./mirror-handoff");
    expect(readMirrorHandoff()).toBeNull();
  });

  it("returns null for a well-formed but invalid-shape payload", async () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => JSON.stringify({ outcome: "matched", text: "missing ids" }),
        setItem: () => {},
      },
    };
    vi.resetModules();
    const { readMirrorHandoff } = await import("./mirror-handoff");
    expect(readMirrorHandoff()).toBeNull();
  });
});

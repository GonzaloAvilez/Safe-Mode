import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, activeEqMock, languageEqMock, narrativeInMock, randomStartIndexMock } = vi.hoisted(() => {
  const languageEqMock = vi.fn();
  const activeEqMock = vi.fn(() => ({ eq: languageEqMock }));
  const narrativeInMock = vi.fn();
  const fromMock = vi.fn((table: string) => {
    if (table === "phrases") return { select: () => ({ eq: activeEqMock }) };
    if (table === "phrase_narratives") return { select: () => ({ in: narrativeInMock }) };
    throw new Error(`Unexpected table: ${table}`);
  });
  // Returns a sentinel unrelated to the input, so a passing test proves the feed
  // forwards whatever randomStartIndex actually produced for the real phrase count —
  // not a coincidence (e.g. both happening to be 0).
  const randomStartIndexMock = vi.fn(() => 42);
  return { fromMock, activeEqMock, languageEqMock, narrativeInMock, randomStartIndexMock };
});

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("./living-phrases", () => ({ LivingPhrases: () => null }));
vi.mock("./random-start-index", () => ({ randomStartIndex: randomStartIndexMock }));

const { LivingPhrasesFeed } = await import("./living-phrases-feed");

beforeEach(() => {
  // Vitest uses classic JSX here; Next.js supplies its own JSX transform in production.
  vi.stubGlobal("React", React);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Home phrase feed", () => {
  it.each(["en", "es"] as const)("keeps classified and unclassified %s phrases, with their dates", async (locale) => {
    const createdAt = "2026-09-01T00:00:00Z";
    languageEqMock.mockResolvedValueOnce({ data: [
      { id: "classified", text: "A human reflection", source: "seed", created_at: createdAt },
      { id: "unclassified", text: "Another human reflection", source: "user", created_at: createdAt },
    ] });
    narrativeInMock.mockResolvedValueOnce({ data: [
      { phrase_id: "classified", public_narrative: "Existing narrative" },
    ] });

    const result = await LivingPhrasesFeed({ locale });

    expect(activeEqMock).toHaveBeenCalledWith("active", true);
    expect(languageEqMock).toHaveBeenCalledWith("language", locale);
    expect(narrativeInMock).toHaveBeenCalledWith("phrase_id", ["classified", "unclassified"]);
    expect(result.props.phrases).toEqual([
      { text: "A human reflection", publicNarrative: "Existing narrative", createdAt },
      { text: "Another human reflection", publicNarrative: undefined, createdAt },
    ]);
  });

  it("keeps human phrases visible when narrative metadata is unavailable", async () => {
    languageEqMock.mockResolvedValueOnce({ data: [
      { id: "1", text: "Human words", created_at: "2026-09-01T00:00:00Z" },
    ] });
    narrativeInMock.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });

    const result = await LivingPhrasesFeed({ locale: "es" });

    expect(result.props.phrases).toEqual([
      { text: "Human words", publicNarrative: undefined, createdAt: "2026-09-01T00:00:00Z" },
    ]);
  });

  it("skips metadata lookup for an empty language corpus", async () => {
    languageEqMock.mockResolvedValueOnce({ data: [] });

    const result = await LivingPhrasesFeed({ locale: "en" });

    expect(result.props.phrases).toEqual([]);
    expect(narrativeInMock).not.toHaveBeenCalled();
  });

  it("passes the server-picked random start index down as a plain client prop", async () => {
    // Regression test for the hydration-mismatch bug: the random index must be
    // computed once here, server-side, from the real phrase count, and forwarded
    // unchanged — never recomputed inside the client component itself.
    languageEqMock.mockResolvedValueOnce({ data: [
      { id: "1", text: "A", created_at: "2026-09-01T00:00:00Z" },
      { id: "2", text: "B", created_at: "2026-09-01T00:00:00Z" },
    ] });
    narrativeInMock.mockResolvedValueOnce({ data: [] });

    const result = await LivingPhrasesFeed({ locale: "en" });

    expect(randomStartIndexMock).toHaveBeenCalledWith(2);
    expect(result.props.initialIndex).toBe(42);
  });
});

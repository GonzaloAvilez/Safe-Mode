import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { recordResonance } = await import("@/lib/phrase-resonances");

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordResonance", () => {
  it("upserts on the phrase_resonances table with the composite key, ignoring duplicates", async () => {
    fromMock.mockReturnValue({ upsert: upsertMock });
    upsertMock.mockResolvedValueOnce({ error: null });

    await recordResonance("phrase-1", "session-1");

    expect(fromMock).toHaveBeenCalledWith("phrase_resonances");
    expect(upsertMock).toHaveBeenCalledWith(
      { phrase_id: "phrase-1", session_id: "session-1" },
      { onConflict: "phrase_id,session_id", ignoreDuplicates: true }
    );
  });

  it("does not throw when the same phrase/session pair is recorded twice", async () => {
    fromMock.mockReturnValue({ upsert: upsertMock });
    upsertMock.mockResolvedValue({ error: null });

    await recordResonance("phrase-1", "session-1");
    await expect(recordResonance("phrase-1", "session-1")).resolves.toBeUndefined();
  });

  it("throws when the upsert fails", async () => {
    fromMock.mockReturnValue({ upsert: upsertMock });
    upsertMock.mockResolvedValueOnce({ error: new Error("upsert failed") });

    await expect(recordResonance("phrase-1", "session-1")).rejects.toThrow("upsert failed");
  });
});

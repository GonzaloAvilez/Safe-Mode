import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anonymizeCrisisEntriesErrorFixture,
  anonymizeCrisisEntriesNoneDueFixture,
  anonymizeCrisisEntriesSuccessFixture,
  insertCrisisContentErrorFixture,
  insertCrisisContentSuccessFixture,
} from "@/test/fixtures/supabase-responses";

const { fromMock, insertMock, updateMock, ltMock, isMock, selectMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  ltMock: vi.fn(),
  isMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { insertCrisisContent, anonymizeExpiredCrisisEntries, CRISIS_RETENTION_DAYS } = await import(
  "@/lib/crisis-entries"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("insertCrisisContent", () => {
  it("inserts the entry id and text into crisis_entries", async () => {
    fromMock.mockReturnValue({ insert: insertMock });
    insertMock.mockResolvedValueOnce(insertCrisisContentSuccessFixture);

    await insertCrisisContent("entry-1", "texto de crisis");

    expect(fromMock).toHaveBeenCalledWith("crisis_entries");
    expect(insertMock).toHaveBeenCalledWith({ entry_id: "entry-1", text: "texto de crisis" });
  });

  it("throws when the insert fails", async () => {
    fromMock.mockReturnValue({ insert: insertMock });
    insertMock.mockResolvedValueOnce(insertCrisisContentErrorFixture);

    await expect(insertCrisisContent("entry-1", "texto de crisis")).rejects.toThrow("insert failed");
  });
});

describe("anonymizeExpiredCrisisEntries", () => {
  function setUpUpdateChain() {
    fromMock.mockReturnValue({ update: updateMock });
    updateMock.mockReturnValue({ lt: ltMock });
    ltMock.mockReturnValue({ is: isMock });
    isMock.mockReturnValue({ select: selectMock });
  }

  it("nulls the text and stamps anonymized_at for rows past the retention window", async () => {
    setUpUpdateChain();
    selectMock.mockResolvedValueOnce(anonymizeCrisisEntriesSuccessFixture);

    await anonymizeExpiredCrisisEntries();

    expect(fromMock).toHaveBeenCalledWith("crisis_entries");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: null, anonymized_at: expect.any(String) })
    );
  });

  it("only targets rows older than CRISIS_RETENTION_DAYS that aren't anonymized yet", async () => {
    setUpUpdateChain();
    selectMock.mockResolvedValueOnce(anonymizeCrisisEntriesSuccessFixture);

    const before = Date.now();
    await anonymizeExpiredCrisisEntries();

    const cutoffArg = ltMock.mock.calls[0][1] as string;
    const daysUntilCutoff = (before - new Date(cutoffArg).getTime()) / (24 * 60 * 60 * 1000);
    expect(ltMock).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(daysUntilCutoff).toBeCloseTo(CRISIS_RETENTION_DAYS, 1);
    expect(isMock).toHaveBeenCalledWith("anonymized_at", null);
  });

  it("returns the number of rows anonymized", async () => {
    setUpUpdateChain();
    selectMock.mockResolvedValueOnce(anonymizeCrisisEntriesSuccessFixture);

    const count = await anonymizeExpiredCrisisEntries();

    expect(count).toBe(2);
  });

  it("returns 0 when no rows are due", async () => {
    setUpUpdateChain();
    selectMock.mockResolvedValueOnce(anonymizeCrisisEntriesNoneDueFixture);

    const count = await anonymizeExpiredCrisisEntries();

    expect(count).toBe(0);
  });

  it("throws when the update fails", async () => {
    setUpUpdateChain();
    selectMock.mockResolvedValueOnce(anonymizeCrisisEntriesErrorFixture);

    await expect(anonymizeExpiredCrisisEntries()).rejects.toThrow("update failed");
  });
});

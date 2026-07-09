import { afterEach, describe, expect, it, vi } from "vitest";
import {
  insertCrisisContentErrorFixture,
  insertCrisisContentSuccessFixture,
} from "@/test/fixtures/supabase-responses";

const { fromMock, insertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { insertCrisisContent } = await import("@/lib/crisis-entries");

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

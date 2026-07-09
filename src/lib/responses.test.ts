import { afterEach, describe, expect, it, vi } from "vitest";
import { insertResponseErrorFixture, insertResponseSuccessFixture } from "@/test/fixtures/supabase-responses";

const { fromMock, insertMock, selectMock, singleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { createResponse } = await import("@/lib/responses");

function setUpInsertChain() {
  fromMock.mockReturnValue({ insert: insertMock });
  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createResponse", () => {
  it("inserts a response row with the entry id and scale_before", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    await createResponse("entry-1", 3);

    expect(fromMock).toHaveBeenCalledWith("responses");
    expect(insertMock).toHaveBeenCalledWith({ entry_id: "entry-1", scale_before: 3 });
  });

  it("inserts scale_before as null when not provided", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    await createResponse("entry-1");

    expect(insertMock).toHaveBeenCalledWith({ entry_id: "entry-1", scale_before: null });
  });

  it("returns the id of the inserted response", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    const result = await createResponse("entry-1", 3);

    expect(result).toEqual({ id: insertResponseSuccessFixture.data.id });
  });

  it("throws when the insert fails", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseErrorFixture);

    await expect(createResponse("entry-1", 3)).rejects.toThrow("insert failed");
  });
});

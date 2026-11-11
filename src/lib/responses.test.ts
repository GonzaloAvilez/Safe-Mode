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

const { createResponse, setWantsReply } = await import("@/lib/responses");

function setUpInsertChain() {
  fromMock.mockReturnValue({ insert: insertMock });
  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createResponse", () => {
  it("inserts a response row with the entry id, session id, and scale_before", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    await createResponse("entry-1", "session-1", 3);

    expect(fromMock).toHaveBeenCalledWith("responses");
    expect(insertMock).toHaveBeenCalledWith({
      entry_id: "entry-1",
      session_id: "session-1",
      scale_before: 3,
    });
  });

  it("inserts scale_before as null when not provided", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    await createResponse("entry-1", "session-1");

    expect(insertMock).toHaveBeenCalledWith({
      entry_id: "entry-1",
      session_id: "session-1",
      scale_before: null,
    });
  });

  it("returns the id of the inserted response", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseSuccessFixture);

    const result = await createResponse("entry-1", "session-1", 3);

    expect(result).toEqual({ id: insertResponseSuccessFixture.data.id });
  });

  it("throws when the insert fails", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertResponseErrorFixture);

    await expect(createResponse("entry-1", "session-1", 3)).rejects.toThrow("insert failed");
  });
});

describe("setWantsReply", () => {
  // update().eq().eq().select() resolving to `result`; records the filters applied.
  function mockUpdate(result: { data: unknown; error: unknown }) {
    const eq = vi.fn();
    const update = vi.fn();
    const chain = { eq, select: vi.fn().mockResolvedValue(result) };
    eq.mockReturnValue(chain);
    update.mockReturnValue(chain);
    fromMock.mockReturnValue({ update });
    return { update, eq };
  }

  it("only updates the entry when it belongs to this session", async () => {
    const { update, eq } = mockUpdate({ data: [{ id: "response-1" }], error: null });

    expect(await setWantsReply("entry-1", "session-1", true)).toBe(true);
    expect(update).toHaveBeenCalledWith({ wants_reply: true });
    expect(eq.mock.calls).toEqual([
      ["entry_id", "entry-1"],
      ["session_id", "session-1"],
    ]);
  });

  it("returns false when no row matched (another session's entry, or an unknown id)", async () => {
    mockUpdate({ data: [], error: null });

    expect(await setWantsReply("entry-1", "someone-else", true)).toBe(false);
  });

  it("throws on a database error", async () => {
    const error = { message: "connection failure" };
    mockUpdate({ data: null, error });

    await expect(setWantsReply("entry-1", "session-1", true)).rejects.toEqual(error);
  });
});

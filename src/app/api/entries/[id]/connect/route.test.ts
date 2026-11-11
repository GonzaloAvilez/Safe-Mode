import { afterEach, describe, expect, it, vi } from "vitest";

const { setWantsReplyMock, getOrCreateSessionIdMock } = vi.hoisted(() => ({
  setWantsReplyMock: vi.fn(),
  getOrCreateSessionIdMock: vi.fn().mockResolvedValue("session-1"),
}));

vi.mock("@/lib/responses", () => ({ setWantsReply: setWantsReplyMock }));
vi.mock("@/lib/session", () => ({ getOrCreateSessionId: getOrCreateSessionIdMock }));

const { POST } = await import("@/app/api/entries/[id]/connect/route");

function connect(body: unknown, id = "entry-1") {
  const request = new Request(`http://localhost/api/entries/${id}/connect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) } as RouteContext<"/api/entries/[id]/connect">);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/entries/[id]/connect", () => {
  it("updates the toggle for the caller's own entry", async () => {
    setWantsReplyMock.mockResolvedValueOnce(true);

    const response = await connect({ value: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(setWantsReplyMock).toHaveBeenCalledWith("entry-1", "session-1", true);
  });

  it("answers 404 when the entry isn't this session's (or doesn't exist)", async () => {
    setWantsReplyMock.mockResolvedValueOnce(false);

    const response = await connect({ value: true }, "someone-elses-entry");

    expect(response.status).toBe(404);
  });

  it.each([["yes"], [1], [null], [undefined]])("rejects a non-boolean value (%j) without touching anything", async (value) => {
    const response = await connect({ value });

    expect(response.status).toBe(400);
    expect(setWantsReplyMock).not.toHaveBeenCalled();
  });
});

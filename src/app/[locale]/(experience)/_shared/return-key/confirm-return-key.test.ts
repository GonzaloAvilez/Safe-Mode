import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmReturnKey } from "./confirm-return-key";

const SEAL = "482133901756229";

function respond(status: number, body: string | null = null) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("confirmReturnKey", () => {
  it("confirms the seal, carried only in the Authorization header", async () => {
    const fetchMock = respond(204);

    await expect(confirmReturnKey(SEAL)).resolves.toEqual({ type: "confirmed" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/return-key/confirm");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: `Bearer ${SEAL}` });
    expect(url).not.toContain(SEAL);
    expect(init.body).toBeUndefined();
  });

  it("says when there were too many tries", async () => {
    respond(429, JSON.stringify({ error: "too many requests" }));

    await expect(confirmReturnKey(SEAL)).resolves.toEqual({ type: "error", reason: "too_many" });
  });

  it.each([401, 500, 200])("treats an answer of %s as not confirmed", async (status) => {
    respond(status, status === 200 ? "{}" : JSON.stringify({ error: "x" }));

    await expect(confirmReturnKey(SEAL)).resolves.toEqual({ type: "error", reason: "failed" });
  });

  it("says when it couldn't reach the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(confirmReturnKey(SEAL)).resolves.toEqual({ type: "error", reason: "offline" });
  });
});

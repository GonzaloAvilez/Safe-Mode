import { afterEach, describe, expect, it, vi } from "vitest";
import { openMailbox } from "./open-mailbox";

const SEAL = "482133901756229";
const MAILBOX = { correspondences: [] };

function stubFetch(response: Response | Error) {
  const fetchMock = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openMailbox", () => {
  it("asks for the mailbox with the seal in the Authorization header, never in the URL, and never cached", async () => {
    const fetchMock = stubFetch(Response.json(MAILBOX));

    await openMailbox(SEAL);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mailbox");
    expect(init.headers).toEqual({ Authorization: `Bearer ${SEAL}` });
    expect(init.cache).toBe("no-store");
    expect(init.body).toBeUndefined();
  });

  it("returns the mailbox when the seal opens one", async () => {
    const mailbox = {
      correspondences: [{ id: "c1", yourSide: "author", state: "your_turn", phraseText: "Una frase.", letters: [] }],
    };
    stubFetch(Response.json(mailbox));

    expect(await openMailbox(SEAL)).toEqual({ type: "opened", mailbox });
  });

  it("says the seal opens nothing when the server doesn't recognize it", async () => {
    stubFetch(Response.json({ error: "return key not recognized" }, { status: 401 }));

    expect(await openMailbox(SEAL)).toEqual({ type: "not_recognized" });
  });

  it("says to wait after too many tries", async () => {
    stubFetch(Response.json({ error: "too many requests" }, { status: 429 }));

    expect(await openMailbox(SEAL)).toEqual({ type: "error", reason: "too_many" });
  });

  it.each([
    ["a server error page", new Response("boom", { status: 500 })],
    ["an error that happens to look like a mailbox", Response.json(MAILBOX, { status: 500 })],
  ])("fails on any other answer from the server: %s", async (_label, response) => {
    stubFetch(response);

    expect(await openMailbox(SEAL)).toEqual({ type: "error", reason: "failed" });
  });

  it.each([
    ["not JSON", new Response("<html>", { status: 200 })],
    ["JSON that isn't a mailbox", Response.json({ letters: [] })],
    ["null", Response.json(null)],
  ])("fails on a 200 whose body is %s", async (_label, response) => {
    stubFetch(response);

    expect(await openMailbox(SEAL)).toEqual({ type: "error", reason: "failed" });
  });

  it("says it couldn't connect when the request never reaches the server", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    expect(await openMailbox(SEAL)).toEqual({ type: "error", reason: "offline" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { requestVisitorReturnKey } from "./request-visitor-return-key";

const SEAL = "482133901756229";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";

function stubFetch(response: Response | Error) {
  const fetchMock = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestVisitorReturnKey", () => {
  it("asks for a seal with the entry and the visitor's language, and nothing else", async () => {
    const fetchMock = stubFetch(Response.json({ type: "created", returnKey: SEAL, returnKeySentence: SENTENCE }, { status: 201 }));

    await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/return-key");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ entryId: "entry-1", locale: "es" });
  });

  it("hands back the seal and its gift sentence", async () => {
    stubFetch(Response.json({ type: "created", returnKey: SEAL, returnKeySentence: SENTENCE }, { status: 201 }));

    expect(await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" })).toEqual({
      type: "created",
      returnKey: SEAL,
      sentence: SENTENCE,
    });
  });

  it.each([
    ["a seal that isn't 15 digits", { returnKey: "12345", returnKeySentence: SENTENCE }],
    ["a seal with spaces (the server never sends one)", { returnKey: "48213 39017 56229", returnKeySentence: SENTENCE }],
    ["no sentence", { returnKey: SEAL }],
    ["no seal", { returnKeySentence: SENTENCE }],
  ])("never shows %s: it failed", async (_label, body) => {
    stubFetch(Response.json(body, { status: 201 }));

    expect(await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" })).toEqual({ type: "error", reason: "failed" });
  });

  it("fails on a 201 that isn't JSON", async () => {
    stubFetch(new Response("ok", { status: 201 }));

    expect(await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" })).toEqual({ type: "error", reason: "failed" });
  });

  it.each([
    [404, { type: "unavailable" }],
    [403, { type: "unavailable" }],
    [503, { type: "letters_closed" }],
    [429, { type: "error", reason: "too_many" }],
    [400, { type: "error", reason: "failed" }],
    [500, { type: "error", reason: "failed" }],
  ])("answers %s as %j", async (status, expected) => {
    stubFetch(Response.json({ error: "x" }, { status }));

    expect(await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" })).toEqual(expected);
  });

  it("says it couldn't connect when the request never reaches the server", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    expect(await requestVisitorReturnKey({ entryId: "entry-1", locale: "es" })).toEqual({ type: "error", reason: "offline" });
  });
});

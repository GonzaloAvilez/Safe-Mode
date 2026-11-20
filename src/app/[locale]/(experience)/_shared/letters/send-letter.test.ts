import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFirstLetter, sendLetter } from "./send-letter";

const SEAL = "482133901756229";
const INPUT = { correspondenceId: "c1", returnKey: SEAL, text: "Gracias por escribirme.", honeypot: "", formRenderedAt: 1000 };

function stubFetch(response: Response | Error) {
  const fetchMock = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendLetter", () => {
  it("posts the letter to its correspondence, the seal only in the Authorization header", async () => {
    const fetchMock = stubFetch(Response.json({ type: "held" }, { status: 201 }));

    await sendLetter(INPUT);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/correspondences/c1/letters");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(JSON.parse(init.body)).toEqual({ text: INPUT.text, honeypot: "", formRenderedAt: 1000 });
    expect(url).not.toContain(SEAL);
    expect(init.body).not.toContain(SEAL);
  });

  it("keeps a strange id inside its own path segment", async () => {
    const fetchMock = stubFetch(Response.json({ type: "held" }, { status: 201 }));

    await sendLetter({ ...INPUT, correspondenceId: "../mailbox" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/correspondences/..%2Fmailbox/letters");
  });

  it.each([
    ["held", { type: "held" }, { type: "held" }],
    ["crisis", { type: "crisis", resourceUrl: "https://findahelpline.com" }, { type: "crisis" }],
    ["moderation", { type: "rejected", reason: "moderation" }, { type: "rejected", reason: "moderation" }],
    [
      "contact info",
      { type: "rejected", reason: "contact_info", contactKinds: ["phone", "handle"] },
      { type: "rejected", reason: "contact_info", contactKinds: ["phone", "handle"] },
    ],
  ])("a written letter that was %s says so", async (_label, body, expected) => {
    stubFetch(Response.json(body, { status: 201 }));

    expect(await sendLetter(INPUT)).toEqual(expected);
  });

  it("keeps only the contact kinds it knows how to name", async () => {
    stubFetch(Response.json({ type: "rejected", reason: "contact_info", contactKinds: ["phone", "<b>"] }, { status: 201 }));

    expect(await sendLetter(INPUT)).toEqual({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });
  });

  it.each([
    ["an unknown type", { type: "delivered" }],
    ["contact info with no kinds it knows", { type: "rejected", reason: "contact_info", contactKinds: ["fax"] }],
    ["contact info without kinds", { type: "rejected", reason: "contact_info" }],
    ["nothing", null],
  ])("a 201 with %s fails rather than guessing", async (_label, body) => {
    stubFetch(Response.json(body, { status: 201 }));

    expect(await sendLetter(INPUT)).toEqual({ type: "error", reason: "failed" });
  });

  it.each([
    [409, { type: "not_allowed" }],
    [401, { type: "not_recognized" }],
    [404, { type: "not_recognized" }],
    [503, { type: "letters_closed" }],
    [429, { type: "error", reason: "too_many" }],
    [400, { type: "error", reason: "failed" }],
    [500, { type: "error", reason: "failed" }],
    [200, { type: "error", reason: "failed" }],
  ])("answers %i as %j", async (status, expected) => {
    stubFetch(Response.json({}, { status }));

    expect(await sendLetter(INPUT)).toEqual(expected);
  });

  it("says it couldn't connect when the request never reaches the server", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    expect(await sendLetter(INPUT)).toEqual({ type: "error", reason: "offline" });
  });
});

describe("sendLetter, the server's own results", () => {
  it.each([
    [409, { type: "not_allowed", reason: "not_your_turn" }, { type: "not_allowed" }],
    [404, { type: "not_found" }, { type: "not_recognized" }],
    [409, null, { type: "not_allowed" }],
    [404, null, { type: "not_recognized" }],
  ])("a %i with %j reads as %j", async (status, body, expected) => {
    stubFetch(Response.json(body, { status }));

    expect(await sendLetter(INPUT)).toEqual(expected);
  });

  it("a rejection for a reason this screen doesn't know fails rather than guessing", async () => {
    stubFetch(Response.json({ type: "rejected", reason: "spam" }, { status: 201 }));

    expect(await sendLetter(INPUT)).toEqual({ type: "error", reason: "failed" });
  });
});

describe("sendFirstLetter", () => {
  const FIRST = { entryId: "entry-1", returnKey: SEAL, text: "Leí tu frase.", honeypot: "", formRenderedAt: 1000 };
  const started = (letter: unknown) => Response.json({ type: "started", correspondenceId: "c1", letter }, { status: 201 });

  it("posts the first letter with its entry, the seal only in the Authorization header", async () => {
    const fetchMock = stubFetch(started({ type: "held" }));

    await sendFirstLetter(FIRST);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/correspondences");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(JSON.parse(init.body)).toEqual({ entryId: "entry-1", text: FIRST.text, honeypot: "", formRenderedAt: 1000 });
    expect(init.body).not.toContain(SEAL);
  });

  it.each([
    ["held", { type: "held" }, { type: "held" }],
    ["crisis", { type: "crisis", resourceUrl: "https://findahelpline.com" }, { type: "crisis" }],
    ["moderation", { type: "rejected", reason: "moderation" }, { type: "rejected", reason: "moderation" }],
    [
      "contact info",
      { type: "rejected", reason: "contact_info", contactKinds: ["email"] },
      { type: "rejected", reason: "contact_info", contactKinds: ["email"] },
    ],
    ["already waiting for review", { type: "not_allowed", reason: "awaiting_review" }, { type: "already_on_its_way" }],
    ["already delivered", { type: "not_allowed", reason: "not_your_turn" }, { type: "already_on_its_way" }],
    ["unknown to the letter pipeline", { type: "not_found" }, { type: "error", reason: "failed" }],
  ])("a first letter that was %s says so", async (_label, letter, expected) => {
    stubFetch(started(letter));

    expect(await sendFirstLetter(FIRST)).toEqual(expected);
  });

  it.each([
    ["a 201 that isn't a started correspondence", Response.json({ type: "held" }, { status: 201 })],
    ["a started correspondence without its id", Response.json({ type: "started", letter: { type: "held" } }, { status: 201 })],
    ["a started correspondence with an unknown letter", started({ type: "teleported" })],
    ["a 201 that isn't JSON", new Response("ok", { status: 201 })],
  ])("never guesses at %s: it failed", async (_label, response) => {
    stubFetch(response);

    expect(await sendFirstLetter(FIRST)).toEqual({ type: "error", reason: "failed" });
  });

  it.each([
    [404, { type: "unavailable" }],
    [403, { type: "unavailable" }],
    [401, { type: "unavailable" }],
    [503, { type: "letters_closed" }],
    [429, { type: "error", reason: "too_many" }],
    [400, { type: "error", reason: "failed" }],
    [500, { type: "error", reason: "failed" }],
  ])("answers %s as %j", async (status, expected) => {
    stubFetch(Response.json({ error: "x" }, { status }));

    expect(await sendFirstLetter(FIRST)).toEqual(expected);
  });

  it("says it couldn't connect when the request never reaches the server", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    expect(await sendFirstLetter(FIRST)).toEqual({ type: "error", reason: "offline" });
  });
});

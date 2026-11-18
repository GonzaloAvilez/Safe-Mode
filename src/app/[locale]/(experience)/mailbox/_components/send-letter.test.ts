import { afterEach, describe, expect, it, vi } from "vitest";
import { LETTER_MAX_LENGTH } from "@/lib/letters";
import { LETTER_MAX_CHARACTERS, sendLetter } from "./send-letter";

// lib/letters.ts is server code: only its constant is read here, so what it connects to is stubbed.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/letter-safety", () => ({ checkLetterSafety: vi.fn() }));

it("allows exactly as long a letter as the server does", () => {
  expect(LETTER_MAX_CHARACTERS).toBe(LETTER_MAX_LENGTH);
});

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

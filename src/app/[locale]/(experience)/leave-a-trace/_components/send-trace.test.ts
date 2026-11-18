import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTrace, type SendTraceInput } from "./send-trace";

const INPUT: SendTraceInput = {
  text: "Lo que no dije también pesa.",
  acceptsLetters: false,
  honeypot: "",
  formRenderedAt: 1234,
  locale: "es",
  messages: { somethingWrong: "Algo salió mal.", couldntConnect: "No pudimos conectar." },
};
const SEAL = "482133901756229";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendTrace", () => {
  it("sends the phrase to /api/phrases as a Leave a Trace, without mentioning letters", async () => {
    const fetchMock = respond(200, { ok: true });

    await expect(sendTrace(INPUT)).resolves.toEqual({ type: "sent" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/phrases");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sentBody(fetchMock)).toEqual({
      text: INPUT.text,
      honeypot: "",
      formRenderedAt: 1234,
      origin: "leave_a_trace",
      locale: "es",
    });
  });

  it("asks for letters only when the person chose them", async () => {
    const fetchMock = respond(200, { ok: true });

    await sendTrace({ ...INPUT, acceptsLetters: true });

    expect(sentBody(fetchMock).acceptsLetters).toBe(true);
  });

  it("hands back the seal and its sentence when the server issued them", async () => {
    respond(200, { ok: true, returnKey: SEAL, returnKeySentence: "Estuviste aquí, y eso también cuenta." });

    await expect(sendTrace({ ...INPUT, acceptsLetters: true })).resolves.toEqual({
      type: "sent_with_key",
      returnKey: SEAL,
      sentence: "Estuviste aquí, y eso también cuenta.",
    });
  });

  it("finishes as a plain trace when letters closed meanwhile and the server issued no seal", async () => {
    respond(200, { ok: true });

    await expect(sendTrace({ ...INPUT, acceptsLetters: true })).resolves.toEqual({ type: "sent" });
  });

  it.each([
    ["a seal that isn't 15 digits", { ok: true, returnKey: "1234", returnKeySentence: "x" }],
    ["a seal without a sentence", { ok: true, returnKey: SEAL }],
    ["a seal that isn't text", { ok: true, returnKey: 482133901756229, returnKeySentence: "x" }],
  ])("never shows a card for %s: it finishes as a plain trace", async (_label, body) => {
    respond(200, body);

    await expect(sendTrace({ ...INPUT, acceptsLetters: true })).resolves.toEqual({ type: "sent" });
  });

  it("ignores a seal nobody asked for", async () => {
    respond(200, { ok: true, returnKey: SEAL, returnKeySentence: "x" });

    await expect(sendTrace(INPUT)).resolves.toEqual({ type: "sent" });
  });

  it("gives the server's reason when it refuses", async () => {
    respond(400, { error: "text is required and must be 400 characters or fewer" });

    await expect(sendTrace(INPUT)).resolves.toEqual({
      type: "error",
      message: "text is required and must be 400 characters or fewer",
    });
  });

  it.each([
    ["an error without a reason", 500, { oops: true }],
    ["an error that isn't JSON", 502, "<html>bad gateway</html>"],
  ])("says something went wrong for %s", async (_label, status, body) => {
    respond(status, body);

    await expect(sendTrace(INPUT)).resolves.toEqual({ type: "error", message: "Algo salió mal." });
  });

  it("says it couldn't connect when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(sendTrace(INPUT)).resolves.toEqual({ type: "error", message: "No pudimos conectar." });
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

vi.mock("../../_shared/screen-header", () => ({ ScreenHeader: ({ tagline }: { tagline: string }) => <header>{tagline}</header> }));
vi.mock("../../_shared/screen-cta", () => ({
  ScreenCta: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <a href="#home" onClick={(event) => (event.preventDefault(), onClick?.())}>
      {label}
    </a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <a href="#home" onClick={(event) => (event.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));

import { MailboxScreen } from "./mailbox-screen";
import { LETTER_FADE_MS, LETTER_TRACE_MS } from "./letter-send-scene";
import { SEAL, correspondence, letter, renderMailbox } from "./mailbox-test-harness";
import type { SendLetterResult } from "./send-letter";

const T = es.mailbox;
const THEIRS = correspondence({ id: "c1", state: "your_turn", letters: [letter({ sender: "visitor", body: "Primera carta." })] });

function writing(overrides: { letterDraft?: string; letterOutcome?: SendLetterResult | null; correspondences?: ReturnType<typeof correspondence>[] } = {}) {
  return {
    returnKey: SEAL,
    mailbox: { correspondences: overrides.correspondences ?? [THEIRS] },
    phase: "writing" as const,
    openCorrespondenceId: "c1",
    letterDraft: overrides.letterDraft ?? "",
    letterOutcome: overrides.letterOutcome ?? null,
  };
}

function reduceMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }));
}

// Answers the given responses in order; anything asked after them (the mailbox the screen asks for
// once a letter is on its way) finds the server out of reach.
function answerWith(...responses: Response[]) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const field = () => screen.getByLabelText(T.write.fieldLabel) as HTMLTextAreaElement;
const letterPosts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/letters"));
const sendButton = () => screen.getByRole("button", { name: T.write.send }) as HTMLButtonElement;
const notice = () => document.getElementById("letter-notice")!.textContent;
const phase = () => screen.getByTestId("phase").textContent;

function writeAndSend(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(sendButton());
}

beforeEach(() => {
  reduceMotion(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Answering a letter", () => {
  it.each([
    ["your_turn", true],
    ["their_turn", false],
    ["awaiting_review", false],
    ["closed", false],
  ] as const)("on a correspondence that is %s, “Responder” shows: %s", (state, shown) => {
    renderMailbox(<MailboxScreen />, { ...writing({ correspondences: [{ ...THEIRS, state }] }), phase: "reading" });

    expect(screen.queryByRole("button", { name: T.letter.reply }) !== null).toBe(shown);
  });

  it("under your own letter that wasn't delivered, it offers to write another (design C3)", () => {
    const rejected = { ...THEIRS, yourSide: "visitor" as const, letters: [letter({ sender: "visitor", status: "rejected", deliveredAt: null })] };
    renderMailbox(<MailboxScreen />, { ...writing({ correspondences: [rejected] }), phase: "reading" });

    expect(screen.getByRole("button", { name: T.letter.writeAnother })).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.letter.reply })).toBeNull();
  });

  it("“Responder” opens a new sheet of paper, numbered after the last letter", () => {
    renderMailbox(<MailboxScreen />, { ...writing(), phase: "reading", letterOutcome: { type: "letters_closed" } });

    fireEvent.click(screen.getByRole("button", { name: T.letter.reply }));

    expect(phase()).toBe("writing");
    expect(screen.getByText("Carta 2 · La tuya")).toBeTruthy();
    expect(screen.getByTestId("outcome").textContent).toBe("");
  });
});

describe("WriteLetterStep, the paper", () => {
  it("can't be sent empty, or blank", () => {
    renderMailbox(<MailboxScreen />, writing());
    expect(sendButton().disabled).toBe(true);

    fireEvent.change(field(), { target: { value: "   " } });

    expect(sendButton().disabled).toBe(true);
  });

  it("a blank letter sent another way (the Enter of a keyboard, a script) still sends nothing", () => {
    const fetchMock = answerWith(Response.json({ type: "held" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing({ letterDraft: "  \n " }));

    fireEvent.submit(field().closest("form")!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(phase()).toBe("writing");
  });

  it("counts up to the 1200 characters the server accepts", () => {
    renderMailbox(<MailboxScreen />, writing());

    fireEvent.change(field(), { target: { value: "Hola." } });

    expect(screen.getByText("5 / 1200")).toBeTruthy();
    expect(field().maxLength).toBe(1200);
  });

  it("keeps the draft in memory, outside this screen", () => {
    renderMailbox(<MailboxScreen />, writing());

    fireEvent.change(field(), { target: { value: "Lo que quiero decirte." } });

    expect(screen.getByTestId("draft").textContent).toBe("Lo que quiero decirte.");
  });

  it("“Ahora no” goes back to the letter, the draft kept", () => {
    renderMailbox(<MailboxScreen />, writing({ letterDraft: "A medias." }));

    fireEvent.click(screen.getByRole("button", { name: T.write.notNow }));

    expect(phase()).toBe("reading");
    expect(screen.getByTestId("draft").textContent).toBe("A medias.");
  });
});

describe("WriteLetterStep, sending", () => {
  it("sends the letter to its correspondence with the seal in the header, and the anti-bot fields", async () => {
    const fetchMock = answerWith(Response.json({ type: "held" }, { status: 201 }));
    const { container } = renderMailbox(<MailboxScreen />, writing());
    fireEvent.change(container.querySelector('input[name="website"]')!, { target: { value: "spam" } });

    writeAndSend("Gracias por escribirme.");

    await waitFor(() => expect(letterPosts(fetchMock)).toHaveLength(1));
    const [url, init] = letterPosts(fetchMock)[0];
    expect(url).toBe("/api/correspondences/c1/letters");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    const body = JSON.parse(init.body);
    expect(body.text).toBe("Gracias por escribirme.");
    expect(body.honeypot).toBe("spam");
    expect(typeof body.formRenderedAt).toBe("number");
  });

  it("a letter on its way: the envelope leaves, the draft is let go, and even with the server out of reach its envelope says “En camino”", async () => {
    answerWith(Response.json({ type: "held" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias por escribirme.");

    await screen.findByText(T.send.headline);
    expect(phase()).toBe("sent");
    expect(document.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("leaving");
    expect(screen.getByTestId("draft").textContent).toBe("");

    fireEvent.click(screen.getByText(T.letter.back));
    const envelope = screen.getAllByRole("button").find((button) => button.dataset.state)!;
    expect(envelope.dataset.state).toBe("awaiting_review");
    expect(within(envelope).getByText(T.list.postmark.awaiting_review)).toBeTruthy();

    fireEvent.click(envelope);
    expect(screen.getByText("Gracias por escribirme.")).toBeTruthy();
    expect(screen.getByText(T.letter.held)).toBeTruthy();
  });

  describe("after a letter is on its way, the server says what the mailbox looks like", () => {
    // What the server holds after the letter: written in the server's words, so the test can tell
    // its version from the screen's stand-in.
    const SERVER_MAILBOX = {
      correspondences: [
        {
          ...THEIRS,
          state: "awaiting_review",
          letters: [THEIRS.letters[0], letter({ sender: "author", status: "held", body: "Así la guardó el servidor.", deliveredAt: null })],
        },
      ],
    };

    it("asks the server for the mailbox, with the seal in the header, and shows the server's version", async () => {
      const fetchMock = answerWith(Response.json({ type: "held" }, { status: 201 }), Response.json(SERVER_MAILBOX));
      renderMailbox(<MailboxScreen />, writing());

      writeAndSend("Lo que escribí.");
      await screen.findByText(T.send.headline);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("/api/mailbox");
      expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
      fireEvent.click(screen.getByText(T.letter.back));
      fireEvent.click(screen.getAllByRole("button").find((button) => button.dataset.state)!);
      expect(screen.getByText("Así la guardó el servidor.")).toBeTruthy();
      expect(screen.queryByText("Lo que escribí.")).toBeNull();
    });

    it("the server's answer still counts if the person already went back to the envelopes", async () => {
      let answer: (response: Response) => void = () => {};
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ type: "held" }, { status: 201 }))
        .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
      vi.stubGlobal("fetch", fetchMock);
      renderMailbox(<MailboxScreen />, writing());
      writeAndSend("Lo que escribí.");
      await screen.findByText(T.send.headline);

      fireEvent.click(screen.getByText(T.letter.back));
      await act(async () => answer(Response.json(SERVER_MAILBOX)));

      fireEvent.click(screen.getAllByRole("button").find((button) => button.dataset.state)!);
      expect(screen.getByText("Así la guardó el servidor.")).toBeTruthy();
    });

    it("an answer that arrives after the mailbox was closed doesn't reopen it", async () => {
      let answer: (response: Response) => void = () => {};
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ type: "held" }, { status: 201 }))
        .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
      vi.stubGlobal("fetch", fetchMock);
      renderMailbox(<MailboxScreen />, writing());
      writeAndSend("Lo que escribí.");
      await screen.findByText(T.send.headline);

      fireEvent.click(screen.getByText(T.backToStart));
      await act(async () => answer(Response.json(SERVER_MAILBOX)));

      expect(screen.getByTestId("opened").textContent).toBe("");
      expect(screen.getByTestId("key").textContent).toBe("");
    });
  });

  it("“Volver al inicio” after sending lets go of the seal", async () => {
    answerWith(Response.json({ type: "held" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());
    writeAndSend("Gracias.");
    await screen.findByText(T.send.headline);

    fireEvent.click(screen.getByText(T.backToStart));

    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("holds the language switch while sending, and lets it go after", async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => (answer = resolve))));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await screen.findByText(T.send.sealing);
    expect(phase()).toBe("sending");
    expect(screen.getByTestId("locked").textContent).toBe("true");
    await act(async () => answer(Response.json({ type: "held" }, { status: 201 })));
    await waitFor(() => expect(screen.getByTestId("locked").textContent).toBe("false"));
  });

  it.each([
    ["moderation", { type: "rejected", reason: "moderation" }, T.write.moderation],
    [
      "one kind of contact",
      { type: "rejected", reason: "contact_info", contactKinds: ["phone"] },
      "Tu carta tiene un número de teléfono. Quítalo y la carta podrá salir. Aquí nadie comparte cómo contactarse: así las dos personas siguen a salvo.",
    ],
    [
      "two kinds of contact",
      { type: "rejected", reason: "contact_info", contactKinds: ["phone", "handle"] },
      "Tu carta tiene un número de teléfono y un usuario de redes. Quítalos y la carta podrá salir. Aquí nadie comparte cómo contactarse: así las dos personas siguen a salvo.",
    ],
  ])("a letter rejected for %s comes back on paper, with what to change, the draft kept", async (_label, body, expected) => {
    answerWith(Response.json(body, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Mi número es 55 1234 5678, @yo");

    await waitFor(() => expect(notice()).toBe(expected));
    expect(phase()).toBe("writing");
    expect(field().value).toBe("Mi número es 55 1234 5678, @yo");
    expect(screen.queryByText(T.send.headline)).toBeNull();
  });

  it.each([
    ["letters are paused", Response.json({ error: "letters are closed" }, { status: 503 }), T.write.lettersClosed],
    ["too many tries", Response.json({}, { status: 429 }), T.write.tooMany],
    ["a server error", new Response("boom", { status: 500 }), T.write.failed],
  ])("when %s, the paper comes back saying so, the draft kept", async (_label, response, expected) => {
    answerWith(response);
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await waitFor(() => expect(notice()).toBe(expected));
    expect(field().value).toBe("Gracias.");
  });

  it("with no connection, says so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await waitFor(() => expect(notice()).toBe(es.common.errors.couldntConnect));
  });

  it("a crisis: no letter leaves, help comes instead, and the draft is let go (design C5)", async () => {
    answerWith(Response.json({ type: "crisis", resourceUrl: "https://findahelpline.com" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("No puedo más.");

    await screen.findByText(T.crisis.intro);
    const link = screen.getByRole("link", { name: "findahelpline.com" });
    expect(link.getAttribute("href")).toBe("https://findahelpline.com");
    expect(screen.getByText(T.crisis.notSent)).toBeTruthy();
    expect(screen.getByTestId("draft").textContent).toBe("");
    expect(screen.queryByLabelText(T.write.fieldLabel)).toBeNull();

    fireEvent.click(screen.getByText(T.letter.back));
    expect(phase()).toBe("correspondences");
    expect(screen.getByTestId("outcome").textContent).toBe("");
  });

  it("the help stays after a language switch: it lives with the mailbox, not the screen", () => {
    renderMailbox(<MailboxScreen />, writing({ letterOutcome: { type: "crisis" } }));

    expect(screen.getByText(T.crisis.intro)).toBeTruthy();
  });

  it("when it's no longer this side's turn, shows the correspondence as it is now, the draft kept", async () => {
    const now = { ...THEIRS, state: "awaiting_review" as const };
    const fetchMock = answerWith(Response.json({ type: "not_allowed" }, { status: 409 }), Response.json({ correspondences: [now] }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await waitFor(() => expect(phase()).toBe("reading"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mailbox");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(screen.queryByRole("button", { name: T.letter.reply })).toBeNull();
    expect(screen.getByTestId("draft").textContent).toBe("Gracias.");
  });

  it("when the seal no longer opens this correspondence, the mailbox closes and asks for it", async () => {
    answerWith(Response.json({ type: "not_found" }, { status: 404 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await screen.findByText(T.show.headline);
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("sends once, however many times the envelope is closed", async () => {
    const fetchMock = answerWith(Response.json({ type: "held" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing({ letterDraft: "Gracias." }));
    const form = field().closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    await screen.findByText(T.send.headline);
    expect(letterPosts(fetchMock)).toHaveLength(1);
  });
});

describe("WriteLetterStep, the envelope's timing", () => {
  it("never shows the envelope leaving before the light went round, even if the server answered at once", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    answerWith(Response.json({ type: "held" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    writeAndSend("Gracias.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LETTER_TRACE_MS - 50);
    });
    expect(document.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("tracing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(document.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("leaving");
  });

  it("a letter that didn't leave puts the light out before the paper comes back", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    answerWith(Response.json({ type: "rejected", reason: "moderation" }, { status: 201 }));
    renderMailbox(<MailboxScreen />, writing());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    writeAndSend("Gracias.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LETTER_TRACE_MS + 10);
    });
    expect(document.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("fading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LETTER_FADE_MS);
    });
    expect(notice()).toBe(T.write.moderation);
  });

  it("coming back to an envelope that already left (a language switch) shows where it ended, without replaying", () => {
    renderMailbox(<MailboxScreen />, { ...writing(), phase: "sent" });

    expect(document.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("left");
    expect(screen.getByText(T.send.headline)).toBeTruthy();
  });
});

// The screen taken away mid-send without closing the mailbox: going to another screen.
function Leavable() {
  const [here, setHere] = useState(true);
  return (
    <>
      {here ? <MailboxScreen /> : null}
      <button type="button" onClick={() => setHere((value) => !value)}>
        ir y volver
      </button>
    </>
  );
}

describe("WriteLetterStep, leaving mid-send", () => {
  it("an answer that arrives after leaving changes nothing, and coming back gives the paper back", async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => (answer = resolve))));
    renderMailbox(<Leavable />, writing());
    writeAndSend("Gracias.");
    await screen.findByText(T.send.sealing);

    fireEvent.click(screen.getByText("ir y volver"));
    await act(async () => answer(Response.json({ type: "held" }, { status: 201 })));

    expect(phase()).toBe("sending");
    expect(screen.getByTestId("locked").textContent).toBe("false");

    fireEvent.click(screen.getByText("ir y volver"));
    await waitFor(() => expect(phase()).toBe("writing"));
    expect(field().value).toBe("Gracias.");
  });
});

describe("WriteLetterStep, one draft per correspondence (#252 review)", () => {
  const A = correspondence({ id: "a", phraseText: "La frase de A.", letters: [letter({ body: "Carta de A." })] });
  const B = correspondence({ id: "b", phraseText: "La frase de B.", letters: [letter({ body: "Carta de B." })] });
  const openEnvelope = (phrase: string) => fireEvent.click(screen.getByText(`“${phrase}”`));
  const reply = () => fireEvent.click(screen.getByRole("button", { name: T.letter.reply }));
  const notNow = () => fireEvent.click(screen.getByRole("button", { name: T.write.notNow }));
  const backToEnvelopes = () => fireEvent.click(screen.getByText(T.letter.back));

  function startOnEnvelopes() {
    renderMailbox(<MailboxScreen />, { returnKey: SEAL, mailbox: { correspondences: [A, B] }, phase: "correspondences" });
  }

  it("what was begun for A never shows when answering B, and A's is still there when coming back", () => {
    startOnEnvelopes();

    openEnvelope("La frase de A.");
    reply();
    fireEvent.change(field(), { target: { value: "Solo para A." } });
    notNow();
    backToEnvelopes();

    openEnvelope("La frase de B.");
    reply();
    expect(field().value).toBe("");
    fireEvent.change(field(), { target: { value: "Solo para B." } });
    notNow();
    backToEnvelopes();

    openEnvelope("La frase de A.");
    reply();
    expect(field().value).toBe("Solo para A.");
    expect(JSON.parse(screen.getByTestId("drafts").textContent!)).toEqual({ a: "Solo para A.", b: "Solo para B." });
  });

  it("sending to B sends B's own text to B, and leaves A's draft alone", async () => {
    const fetchMock = answerWith(Response.json({ type: "held" }, { status: 201 }));
    startOnEnvelopes();
    openEnvelope("La frase de A.");
    reply();
    fireEvent.change(field(), { target: { value: "Solo para A." } });
    notNow();
    backToEnvelopes();
    openEnvelope("La frase de B.");
    reply();

    writeAndSend("Solo para B.");

    await screen.findByText(T.send.headline);
    const [url, init] = letterPosts(fetchMock)[0];
    expect(url).toBe("/api/correspondences/b/letters");
    expect(JSON.parse(init.body).text).toBe("Solo para B.");
    expect(JSON.parse(screen.getByTestId("drafts").textContent!)).toEqual({ a: "Solo para A.", b: "" });
  });
});

describe("WriteLetterStep, asking for the mailbox again fails (#252 review)", () => {
  it("after “not your turn”, a seal the server no longer recognizes closes the mailbox", async () => {
    answerWith(Response.json({ type: "not_allowed", reason: "not_your_turn" }, { status: 409 }), Response.json({}, { status: 401 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await screen.findByText(T.show.headline);
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(screen.getByTestId("opened").textContent).toBe("");
  });

  it.each([
    ["a server error", new Response("boom", { status: 500 }), T.write.failed],
    ["too many tries", Response.json({}, { status: 429 }), T.write.tooMany],
  ])("after “not your turn”, %s gives the paper back with what happened, the draft kept, never old contents as new", async (_label, refresh, expected) => {
    const fetchMock = answerWith(Response.json({ type: "not_allowed", reason: "not_your_turn" }, { status: 409 }), refresh);
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await waitFor(() => expect(notice()).toBe(expected));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(phase()).toBe("writing");
    expect(field().value).toBe("Gracias.");
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
  });

  it("with no connection to ask again, says so, and the letter can be sent again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ type: "not_allowed", reason: "not_your_turn" }, { status: 409 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json({ type: "held" }, { status: 201 }))
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");
    await waitFor(() => expect(notice()).toBe(es.common.errors.couldntConnect));
    fireEvent.click(sendButton());

    await screen.findByText(T.send.headline);
  });

  it("after a letter is on its way, a seal the server no longer recognizes closes the mailbox too", async () => {
    answerWith(Response.json({ type: "held" }, { status: 201 }), Response.json({}, { status: 401 }));
    renderMailbox(<MailboxScreen />, writing());

    writeAndSend("Gracias.");

    await screen.findByText(T.show.headline);
    expect(screen.getByTestId("key").textContent).toBe("");
  });
});

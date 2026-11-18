// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { readSealFromImageMock } = vi.hoisted(() => ({ readSealFromImageMock: vi.fn() }));
vi.mock("./read-seal-from-image", () => ({ readSealFromImage: readSealFromImageMock }));

vi.mock("../../_shared/screen-header", () => ({ ScreenHeader: ({ tagline }: { tagline: string }) => <header>{tagline}</header> }));
vi.mock("../../_shared/screen-cta", () => ({
  ScreenCta: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <a href="#close" onClick={(event) => (event.preventDefault(), onClick?.())}>
      {label}
    </a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href="#close" className={className} onClick={(event) => (event.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));

import { MailboxScreen } from "./mailbox-screen";
import { SEAL, correspondence, letter, renderMailbox } from "./mailbox-test-harness";

const T = es.mailbox;

function opened(correspondences = [correspondence()], phase: "correspondences" | "reading" = "correspondences", openCorrespondenceId: string | null = null) {
  return { returnKey: SEAL, mailbox: { correspondences }, phase, openCorrespondenceId };
}

afterEach(() => {
  cleanup();
});

describe("MailboxScreen, before it's open", () => {
  it("asks for the seal", () => {
    renderMailbox(<MailboxScreen />);

    expect(screen.getByText(T.show.headline)).toBeTruthy();
    expect(screen.getByText(T.tagline)).toBeTruthy();
  });

  it("asks for the seal again if the seal is no longer in memory, whatever the step says", () => {
    renderMailbox(<MailboxScreen />, { ...opened(), returnKey: null, phase: "reading", openCorrespondenceId: "c1" });

    expect(screen.getByText(T.show.headline)).toBeTruthy();
    expect(screen.queryByText(T.list.headline)).toBeNull();
  });
});

describe("MailboxScreen, leaving while the mailbox is still opening", () => {
  const sealField = () => screen.getByLabelText(T.show.fieldLabel);
  const expectClosed = () => {
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(screen.getByTestId("opened").textContent).toBe("");
    expect(screen.getByTestId("phase").textContent).toBe("showing_seal");
    expect(screen.getByText(T.show.headline)).toBeTruthy();
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    readSealFromImageMock.mockReset();
  });

  it("a mailbox that arrives after “Volver al inicio” stays closed", async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => (answer = resolve))));
    renderMailbox(<MailboxScreen />);
    fireEvent.change(sealField(), { target: { value: SEAL } });
    fireEvent.click(screen.getByRole("button", { name: T.show.submit }));
    await screen.findByText(T.show.opening);

    fireEvent.click(screen.getByText(T.backToStart));
    await act(async () => answer(Response.json({ correspondences: [correspondence()] })));

    expectClosed();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("a seal read from the picture after “Volver al inicio” opens nothing, and nothing is asked of the server", async () => {
    let read: (seal: string | null) => void = () => {};
    readSealFromImageMock.mockReturnValue(new Promise((resolve) => (read = resolve)));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ correspondences: [correspondence()] }));
    vi.stubGlobal("fetch", fetchMock);
    renderMailbox(<MailboxScreen />);
    fireEvent.change(screen.getByLabelText(T.show.chooseImage), { target: { files: [new File(["png"], "sello.png")] } });
    await screen.findByText(T.show.reading);

    fireEvent.click(screen.getByText(T.backToStart));
    await act(async () => read(SEAL));

    expect(fetchMock).not.toHaveBeenCalled();
    expectClosed();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("after leaving, opening it again with the seal still works", async () => {
    let answer: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(Response.json({ correspondences: [correspondence()] }));
    vi.stubGlobal("fetch", fetchMock);
    renderMailbox(<MailboxScreen />);
    fireEvent.change(sealField(), { target: { value: SEAL } });
    fireEvent.click(screen.getByRole("button", { name: T.show.submit }));
    await screen.findByText(T.show.opening);
    fireEvent.click(screen.getByText(T.backToStart));
    await act(async () => answer(Response.json({ correspondences: [] })));

    fireEvent.change(sealField(), { target: { value: SEAL } });
    fireEvent.click(screen.getByRole("button", { name: T.show.submit }));

    await screen.findByText(T.list.headline);
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
  });
});

describe("MailboxScreen, the envelopes", () => {
  it("shows one envelope per correspondence, with its phrase and whose turn it is", () => {
    renderMailbox(
      <MailboxScreen />,
      opened([
        correspondence({ id: "a", state: "your_turn", phraseText: "Una." }),
        correspondence({ id: "b", state: "their_turn", phraseText: "Dos." }),
        correspondence({ id: "c", yourSide: "visitor", state: "awaiting_review", phraseText: "Tres." }),
        correspondence({ id: "d", state: "closed", phraseText: "Cuatro." }),
      ])
    );

    const envelopes = screen.getAllByRole("button").filter((button) => button.dataset.state);
    expect(envelopes.map((envelope) => envelope.dataset.state)).toEqual(["your_turn", "their_turn", "awaiting_review", "closed"]);
    expect(within(envelopes[0]).getByText(T.list.postmark.your_turn)).toBeTruthy();
    expect(within(envelopes[1]).getByText(T.list.postmark.their_turn)).toBeTruthy();
    expect(within(envelopes[2]).getByText(T.list.postmark.awaiting_review)).toBeTruthy();
    expect(within(envelopes[3]).getByText(T.list.postmark.closed)).toBeTruthy();
    expect(within(envelopes[0]).getByText("“Una.”")).toBeTruthy();
  });

  it("says which side of the correspondence you're on", () => {
    renderMailbox(
      <MailboxScreen />,
      opened([correspondence({ id: "a", yourSide: "author" }), correspondence({ id: "b", yourSide: "visitor" })])
    );

    const [mine, theirs] = screen.getAllByRole("button").filter((button) => button.dataset.state);
    expect(within(mine).getByText(T.list.aboutYourTrace)).toBeTruthy();
    expect(within(theirs).getByText(T.list.toAPhrase)).toBeTruthy();
  });

  it("explains “on its way” only when an envelope is on its way, and always that letters are kept 60 days", () => {
    renderMailbox(<MailboxScreen />, opened([correspondence({ state: "your_turn" })]));
    expect(screen.queryByText(T.list.onItsWay, { exact: false })).toBeNull();
    expect(screen.getByText(T.list.kept, { exact: false })).toBeTruthy();
    cleanup();

    renderMailbox(<MailboxScreen />, opened([correspondence({ state: "awaiting_review", yourSide: "visitor" })]));
    expect(screen.getByText(T.list.onItsWay, { exact: false })).toBeTruthy();
  });

  it("closing the mailbox lets go of the seal and the letters", () => {
    renderMailbox(<MailboxScreen />, opened());

    fireEvent.click(screen.getByText(T.close));

    expect(screen.getByTestId("key").textContent).toBe("");
    expect(screen.getByTestId("opened").textContent).toBe("");
    expect(screen.getByTestId("phase").textContent).toBe("showing_seal");
  });

  it("opening an envelope reads that correspondence", () => {
    renderMailbox(<MailboxScreen />, opened([correspondence({ id: "a" }), correspondence({ id: "b", phraseText: "Otra." })]));

    fireEvent.click(screen.getByText("“Otra.”"));

    expect(screen.getByTestId("phase").textContent).toBe("reading");
    expect(screen.getByTestId("openCorrespondence").textContent).toBe("b");
    expect(screen.getByText(T.letter.back)).toBeTruthy();
  });
});

describe("MailboxScreen, an empty mailbox", () => {
  it("says there are no letters yet, and that that's okay", () => {
    renderMailbox(<MailboxScreen />, opened([]));

    expect(screen.getByText(T.empty.headline)).toBeTruthy();
    expect(screen.getByText(T.empty.subcopy)).toBeTruthy();
    expect(screen.getByText(T.empty.kept)).toBeTruthy();
  });

  it("going back to the start lets go of the seal", () => {
    renderMailbox(<MailboxScreen />, opened([]));

    fireEvent.click(screen.getByText(T.backToStart));

    expect(screen.getByTestId("key").textContent).toBe("");
  });
});

describe("MailboxScreen, reading", () => {
  const exchange = correspondence({
    id: "c1",
    letters: [
      letter({ sender: "visitor", body: "Primera carta." }),
      letter({ sender: "author", body: "Mi respuesta." }),
      letter({ sender: "visitor", body: "Segunda carta." }),
    ],
  });

  it("opens on the latest letter", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));

    expect(screen.getByText("Segunda carta.")).toBeTruthy();
    expect(screen.getByText("Carta 3")).toBeTruthy();
    expect(screen.queryByText("Primera carta.")).toBeNull();
  });

  it("goes back and forth between letters, one at a time", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));
    const next = () => screen.getByRole("button", { name: T.letter.next }) as HTMLButtonElement;
    const previous = () => screen.getByRole("button", { name: T.letter.previous }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);

    fireEvent.click(previous());
    expect(screen.getByText("Mi respuesta.")).toBeTruthy();
    fireEvent.click(previous());
    expect(screen.getByText("Primera carta.")).toBeTruthy();
    expect(previous().disabled).toBe(true);

    fireEvent.click(next());
    expect(screen.getByText("Mi respuesta.")).toBeTruthy();
  });

  it("each dot goes straight to its letter, and marks the one being read", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));

    fireEvent.click(screen.getByRole("button", { name: "Ir a la carta 1" }));

    expect(screen.getByText("Primera carta.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir a la carta 1" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Ir a la carta 3" }).getAttribute("aria-current")).toBeNull();
  });

  it("a single letter needs no navigation", () => {
    renderMailbox(<MailboxScreen />, opened([correspondence()], "reading", "c1"));

    expect(screen.queryByRole("button", { name: T.letter.previous })).toBeNull();
  });

  it("shows the phrase the correspondence is about", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));

    expect(screen.getByText(`“${exchange.phraseText}”`)).toBeTruthy();
    expect(screen.getByText(T.list.aboutYourTrace)).toBeTruthy();
  });

  it("back to the envelopes", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));

    fireEvent.click(screen.getByText(T.letter.back));

    expect(screen.getByTestId("phase").textContent).toBe("correspondences");
    expect(screen.getByTestId("openCorrespondence").textContent).toBe("");
    expect(screen.getByText(T.list.headline)).toBeTruthy();
  });

  it("the step decides, not a correspondence left open: on the envelopes step, the envelopes show", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "correspondences", "c1"));

    expect(screen.getByText(T.list.headline)).toBeTruthy();
    expect(screen.queryByText("Segunda carta.")).toBeNull();
  });

  it("a correspondence that isn't in the mailbox shows the envelopes instead", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "gone"));

    expect(screen.getByText(T.list.headline)).toBeTruthy();
  });

  it("offers no way to reply yet", () => {
    renderMailbox(<MailboxScreen />, opened([exchange], "reading", "c1"));

    expect(screen.queryByRole("button", { name: /responder/i })).toBeNull();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceProviders, useResetRitual } from "@/app/_components/experience-state/providers";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState, type MirrorLetter } from "@/app/_components/experience-state/ritual";
import type { MirrorHandoff } from "../../_shared/mirror-handoff";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// The real router is the same object on every render; so is this one.
const { handoffMock, pickMock, router } = vi.hoisted(() => ({ handoffMock: vi.fn(), pickMock: vi.fn(), router: { replace: () => {} } }));

vi.mock("../../_shared/mirror-handoff", () => ({ readMirrorHandoff: handoffMock }));
vi.mock("../mirror-canvas", () => ({ MirrorCanvas: () => <div data-testid="mirror-canvas" /> }));
vi.mock("../../_shared/screen-header", () => ({ ScreenHeader: ({ tagline }: { tagline: string }) => <header>{tagline}</header> }));
vi.mock("../../_shared/screen-cta", () => ({
  ScreenCta: ({ label, placement = "fixed" }: { label: string; placement?: string }) => (
    <a href="#next" data-placement={placement}>
      {label}
    </a>
  ),
}));
vi.mock("../../_shared/handpan-audio", () => ({ playRandomNote: vi.fn(), playTransition: vi.fn() }));
// The phrase shows at once and says it's done, as the real one does once the last letter appears.
// With `phraseReveal.hold`, it stays mid-way until the test calls `phraseReveal.finish()`; a phrase
// shown `instant` never waits, as with the real one.
const phraseReveal = vi.hoisted(() => ({ hold: false, finish: () => {} }));
vi.mock("./quote-reveal", async () => {
  const { useEffect, useState } = await import("react");
  return {
    QuoteReveal: ({ text, instant, onRevealed }: { text: string; instant?: boolean; onRevealed?: () => void }) => {
      // Read once, like the real one: only when the phrase first shows.
      const [waits] = useState(() => phraseReveal.hold && !instant);
      const [shown, setShown] = useState(!waits);
      useEffect(() => {
        if (!waits) {
          onRevealed?.();
          return;
        }
        phraseReveal.finish = () => {
          setShown(true);
          onRevealed?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <>{shown ? text : ""}</>;
    },
  };
});
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/return-key-groups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-groups")>()),
  pickAskedGroup: pickMock,
}));

import { MirrorScreen } from "./mirror-screen";
import { LIT_LIGHT_HOLD_MS } from "../../_shared/return-key/confirm-return-key-step";
import { LETTER_FADE_MS, LETTER_TRACE_MS } from "../../_shared/letters/letter-send-scene";

// ADR-004 #212, design B: writing a letter from Mirror, through the real screen and the real
// ritual state, with every request answered by the test.

const SEAL = "482133901756229";
const MIDDLE_GROUP = "39017";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";
const PHRASE = "Hay días en que sonrío para que nadie pregunte.";
const L = es.mirror.letter;
const P = es.letterPaper;
const N = es.letterNotice;

const handoff = (overrides: Partial<Extract<MirrorHandoff, { outcome: "matched" }>> = {}): MirrorHandoff => ({
  outcome: "matched",
  text: PHRASE,
  entryId: "entry-1",
  phraseId: "phrase-1",
  connectable: true,
  ...overrides,
});

// Answers each request by its path; anything else fails loudly.
type Answer = Response | Error | (() => Response | Promise<Response>);
let answers: Record<string, Answer[]>;
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  void _init;
  const queue = answers[url];
  const next = queue?.length ? (queue.length > 1 ? queue.shift()! : queue[0]) : undefined;
  if (!next) throw new Error(`unexpected request to ${url}`);
  if (next instanceof Error) throw next;
  return typeof next === "function" ? next() : next.clone();
});
const created = () => Response.json({ type: "created", returnKey: SEAL, returnKeySentence: SENTENCE }, { status: 201 });
const started = (letter: unknown) => Response.json({ type: "started", correspondenceId: "c1", letter }, { status: 201 });
const calls = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url);
// What the screen sent in its `index`-th request to `url`.
const sentTo = (url: string, index = 0) => calls(url)[index][1] as { headers: Record<string, string>; body: string };

function Seeded({ letter, children }: { letter: MirrorLetter | null; children: ReactNode }) {
  const { setMirrorLetter } = useRitualState();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setMirrorLetter(letter);
    // Test-only: seeds the ritual state, then shows the screen on the next render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready ? <>{children}</> : null;
}

function Readout() {
  const { mirrorLetter } = useRitualState();
  const { locked } = useLocaleTransition();
  return (
    <div hidden>
      <output data-testid="phase">{mirrorLetter?.phase ?? ""}</output>
      <output data-testid="draft">{mirrorLetter?.draft ?? ""}</output>
      <output data-testid="key">{mirrorLetter?.key?.returnKey ?? ""}</output>
      <output data-testid="locked">{String(locked)}</output>
    </div>
  );
}

// Test-only controls: returning home (a new ritual), and leaving Mirror while the providers,
// which sit above every screen, stay.
function Stage() {
  const resetRitual = useResetRitual();
  const [onMirror, setOnMirror] = useState(true);
  return (
    <>
      {onMirror && <MirrorScreen />}
      <button type="button" onClick={resetRitual}>
        test: new ritual
      </button>
      <button type="button" onClick={() => setOnMirror(false)}>
        test: leave Mirror
      </button>
      <button type="button" onClick={() => setOnMirror(true)}>
        test: back to Mirror
      </button>
    </>
  );
}

function renderMirror(letter: MirrorLetter | null = null, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <ExperienceProviders>
        <Seeded letter={letter}>
          <Stage />
        </Seeded>
        <Readout />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

const state = (id: string) => screen.getByTestId(id).textContent;
const button = (name: string) => screen.queryByRole("button", { name });
const door = () => button(L.writeButton);
const field = () => screen.getByLabelText(P.fieldLabel) as HTMLTextAreaElement;
const notice = () => document.getElementById("first-letter-notice")!.textContent;

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function openDoor() {
  fireEvent.click(door()!);
  await settle();
}

async function keepByHandAndConfirm() {
  fireEvent.click(button(es.returnKey.keep.wroteByHand)!);
  fireEvent.click(screen.getByRole("checkbox", { name: es.returnKey.keep.wroteConfirm }));
  fireEvent.click(button(es.returnKey.keep.continue)!);
  fireEvent.change(screen.getByPlaceholderText("00000"), { target: { value: MIDDLE_GROUP } });
  fireEvent.click(button(es.returnKey.confirm.submit)!);
  await settle(LIT_LIGHT_HOLD_MS);
}

async function writeAndSend(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(button(P.send)!);
  await settle(LETTER_TRACE_MS + LETTER_FADE_MS);
}

// A visitor at the paper, seal confirmed.
const WRITING: MirrorLetter = {
  entryId: "entry-1",
  phase: "writing",
  backOnPhrase: false,
  key: { returnKey: SEAL, sentence: SENTENCE },
  lastAsked: null,
  draft: "",
  outcome: null,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  handoffMock.mockReturnValue(handoff());
  pickMock.mockReturnValue(1);
  answers = {
    "/api/return-key": [created()],
    "/api/return-key/confirm": [new Response(null, { status: 204 })],
    "/api/correspondences": [started({ type: "held" })],
  };
});

afterEach(() => {
  phraseReveal.hold = false;
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Mirror's door to a letter", () => {
  it("offers a letter, with what it promises, only when the phrase can receive one", async () => {
    renderMirror();
    await settle();

    expect(door()).toBeTruthy();
    expect(screen.getByText(L.writeHint)).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(es.mirror.connectButton) })).toBeNull();
  });

  it("keeps “Me encantaría conectar” for a phrase that can't receive letters", async () => {
    handoffMock.mockReturnValue(handoff({ connectable: false }));
    renderMirror();
    await settle();

    expect(door()).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(es.mirror.connectButton) })).toBeTruthy();
  });

  it("offers nothing for an entry that matched no phrase", async () => {
    handoffMock.mockReturnValue({ outcome: "no_match", entryId: "entry-1" });
    renderMirror();
    await settle();

    expect(door()).toBeNull();
  });

  it("asks for a seal for this entry, in the visitor's language, and shows the card", async () => {
    renderMirror();
    await settle();

    await openDoor();

    expect(JSON.parse(sentTo("/api/return-key").body)).toEqual({ entryId: "entry-1", locale: "es" });
    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByText(L.keepBody)).toBeTruthy();
    expect(state("phase")).toBe("keeping");
  });

  it("never keeps the seal anywhere but memory", async () => {
    renderMirror();
    await settle();
    await openDoor();

    const stored = JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie + location.href;
    expect(stored).not.toContain(SEAL);
  });

  it("asks only once however many times the door is pressed while it's asking", async () => {
    let answer!: (response: Response) => void;
    answers["/api/return-key"] = [() => new Promise<Response>((resolve) => (answer = resolve))];
    renderMirror();
    await settle();

    fireEvent.click(door() ?? button(L.requesting)!);
    fireEvent.click(button(L.requesting)!);
    expect(calls("/api/return-key")).toHaveLength(1);

    await act(async () => answer(created()));
    expect(state("phase")).toBe("keeping");
  });

  it.each([
    ["a new ritual starts", "test: new ritual"],
    ["the visitor leaves Mirror", "test: leave Mirror"],
  ])("lets go of a seal that arrives after %s, so nothing opens on its own", async (_label, control) => {
    let answer!: (response: Response) => void;
    answers["/api/return-key"] = [() => new Promise<Response>((resolve) => (answer = resolve))];
    renderMirror();
    await settle();
    fireEvent.click(door()!);
    await settle();

    fireEvent.click(button(control)!);
    await act(async () => answer(created()));
    await settle();

    expect(state("phase")).toBe("");
    expect(state("key")).toBe("");
    expect(document.body.textContent).not.toContain("48213");
  });

  it("a door still on screen when a new ritual starts stops waiting, and can be opened again", async () => {
    let answer!: (response: Response) => void;
    answers["/api/return-key"] = [() => new Promise<Response>((resolve) => (answer = resolve))];
    renderMirror();
    await settle();
    fireEvent.click(door()!);
    await settle();

    fireEvent.click(button("test: new ritual")!);
    await act(async () => answer(created()));
    await settle();

    expect(state("key")).toBe("");
    expect((door() as HTMLButtonElement).disabled).toBe(false);
  });

  it("lets go of a seal from before a new ritual even when the new one asks for its own", async () => {
    const answersInOrder: ((response: Response) => void)[] = [];
    answers["/api/return-key"] = [() => new Promise<Response>((resolve) => answersInOrder.push(resolve))];
    renderMirror();
    await settle();
    fireEvent.click(door()!);
    await settle();
    fireEvent.click(button("test: new ritual")!);
    fireEvent.click(button("test: leave Mirror")!);
    fireEvent.click(button("test: back to Mirror")!);
    fireEvent.click(door()!);
    await settle();

    const otherSeal = "111112222233333";
    await act(async () => answersInOrder[1](Response.json({ returnKey: otherSeal, returnKeySentence: SENTENCE }, { status: 201 })));
    await act(async () => answersInOrder[0](created()));
    await settle();

    expect(state("key")).toBe(otherSeal);
  });

  it.each([
    ["letters are paused", Response.json({}, { status: 503 }), L.lettersClosed, false],
    ["the phrase can't receive letters anymore", Response.json({}, { status: 403 }), L.unavailable, false],
    ["the entry no longer counts", Response.json({}, { status: 404 }), L.unavailable, false],
    ["too many tries", Response.json({}, { status: 429 }), N.tooMany, true],
    ["a server error", new Response("boom", { status: 500 }), L.requestFailed, true],
    ["no connection", new TypeError("Failed to fetch"), es.common.errors.couldntConnect, true],
  ])("when %s, says so, shows no card, and offers the door again only if it can open", async (_label, answer, message, doorStays) => {
    answers["/api/return-key"] = [answer];
    renderMirror();
    await settle();

    await openDoor();

    expect(screen.getByText(message)).toBeTruthy();
    expect(state("phase")).toBe("");
    expect(Boolean(door())).toBe(doorStays);
  });
});

// #263: everything under the phrase waits for it to finish appearing, so nothing visible is pushed
// while the card grows; it keeps its place meanwhile, hidden and out of reach.
describe("What follows the phrase", () => {
  const subcopy = () => screen.getByText(es.mirror.subcopyMatched);
  const connect = () => screen.queryByRole("button", { name: new RegExp(es.mirror.connectButton) });

  it("waits, hidden and out of reach, until the phrase has finished, then shows the letter door", async () => {
    phraseReveal.hold = true;
    renderMirror();
    await settle();

    expect(door()).toBeNull();
    expect(subcopy().closest("[aria-hidden='true']")).not.toBeNull();
    expect(subcopy().closest("[inert]")).not.toBeNull();

    expect(screen.queryByText(PHRASE)).toBeNull();
    act(() => phraseReveal.finish());

    expect(screen.getByText(PHRASE)).toBeTruthy();
    expect(door()).toBeTruthy();
    expect(subcopy().closest("[aria-hidden='true']")).toBeNull();
    expect(subcopy().closest("[inert]")).toBeNull();
  });

  it("waits the same way with “Me encantaría conectar”", async () => {
    phraseReveal.hold = true;
    handoffMock.mockReturnValue(handoff({ connectable: false }));
    renderMirror();
    await settle();

    expect(connect()).toBeNull();
    act(() => phraseReveal.finish());
    expect(connect()).toBeTruthy();
  });

  it("waits the same way when nothing matched", async () => {
    phraseReveal.hold = true;
    handoffMock.mockReturnValue({ outcome: "no_match", entryId: "entry-1" });
    renderMirror();
    await settle();

    const noMatchSubcopy = screen.getByText(es.mirror.subcopyNoMatch);
    expect(noMatchSubcopy.closest("[aria-hidden='true']")).not.toBeNull();
    act(() => phraseReveal.finish());
    expect(noMatchSubcopy.closest("[aria-hidden='true']")).toBeNull();
  });

  it("“Seguir” comes after all of it, so a long phrase can't end up under it", async () => {
    renderMirror();
    await settle();

    expect(screen.getByRole("link", { name: es.common.continue }).getAttribute("data-placement")).toBe("flow");
  });

  it("the door's hint is always what describes it, also where it only shows on hover", async () => {
    renderMirror();
    await settle();

    const hint = screen.getByText(L.writeHint);
    expect(door()!.getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("coming back to the phrase from the letter doesn't wait for it again", async () => {
    renderMirror(WRITING);
    await settle();
    await writeAndSend("Gracias.");
    phraseReveal.hold = true;

    fireEvent.click(button(L.backToPhrase)!);

    expect(screen.getByText(PHRASE)).toBeTruthy();
    expect(screen.getByText(L.onItsWay).closest("[aria-hidden='true']")).toBeNull();
  });

  it("a phrase already left behind for a letter shows at once when Mirror opens again", async () => {
    phraseReveal.hold = true;
    renderMirror({ ...WRITING, phase: "sent", backOnPhrase: true });
    await settle();

    expect(screen.getByText(PHRASE)).toBeTruthy();
    expect(screen.getByText(L.onItsWay).closest("[aria-hidden='true']")).toBeNull();
  });
});

describe("Keeping and confirming the seal", () => {
  it("goes from the card to the missing light to the paper, confirming the seal it was given", async () => {
    renderMirror();
    await settle();
    await openDoor();

    await keepByHandAndConfirm();

    const init = sentTo("/api/return-key/confirm");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(state("phase")).toBe("writing");
    expect(screen.getByText("Carta 1 · La tuya")).toBeTruthy();
    expect(screen.getByText(`Para quien dejó: “${PHRASE}”`)).toBeTruthy();
  });

  it("stays on the missing light, saying so, when the seal can't be confirmed", async () => {
    answers["/api/return-key/confirm"] = [new Response("boom", { status: 500 })];
    renderMirror();
    await settle();
    await openDoor();

    await keepByHandAndConfirm();

    expect(screen.getByText(L.confirmFailed)).toBeTruthy();
    expect(state("phase")).toBe("confirming");
  });

  it("“Volver a su frase” from the card keeps the seal, and the door picks up there without asking again", async () => {
    renderMirror();
    await settle();
    await openDoor();

    fireEvent.click(button(L.backToPhrase)!);
    expect(screen.getByText(PHRASE)).toBeTruthy();
    expect(state("key")).toBe(SEAL);

    await openDoor();
    expect(state("phase")).toBe("keeping");
    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(calls("/api/return-key")).toHaveLength(1);
  });

  it("going back to see the seal from the missing light asks a different group next time", async () => {
    renderMirror();
    await settle();
    await openDoor();
    fireEvent.click(button(es.returnKey.keep.wroteByHand)!);
    fireEvent.click(screen.getByRole("checkbox", { name: es.returnKey.keep.wroteConfirm }));
    fireEvent.click(button(es.returnKey.keep.continue)!);

    fireEvent.click(button(es.returnKey.confirm.back)!);
    expect(state("phase")).toBe("keeping");
    // Already kept once: it can go on without saving it again.
    fireEvent.click(button(es.returnKey.keep.continue)!);

    expect(pickMock).toHaveBeenLastCalledWith(1);
  });
});

describe("Writing and sending the first letter", () => {
  it("sends the letter for this entry, the seal only in the header, and the envelope leaves", async () => {
    renderMirror(WRITING);
    await settle();

    await writeAndSend("Leí tu frase y sentí que alguien me había visto.");

    const init = sentTo("/api/correspondences");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ entryId: "entry-1", text: "Leí tu frase y sentí que alguien me había visto.", honeypot: "" });
    expect(typeof body.formRenderedAt).toBe("number");
    expect(init.body).not.toContain(SEAL);
    expect(screen.getByText(es.letterSend.headline)).toBeTruthy();
    expect(screen.getByText(/Su respuesta te esperará en el sobre del inicio/)).toBeTruthy();
    expect(state("phase")).toBe("sent");
  });

  it("lets go of the seal and the draft once the letter has left", async () => {
    renderMirror(WRITING);
    await settle();

    await writeAndSend("Gracias por dejarla aquí.");

    expect(state("key")).toBe("");
    expect(state("draft")).toBe("");
    expect(document.body.textContent).not.toContain(SEAL);
  });

  it("holds the language switch while sending, and lets it go after", async () => {
    let answer!: (response: Response) => void;
    answers["/api/correspondences"] = [() => new Promise<Response>((resolve) => (answer = resolve))];
    renderMirror(WRITING);
    await settle();
    fireEvent.change(field(), { target: { value: "Hola." } });
    fireEvent.click(button(P.send)!);
    await settle();

    expect(state("locked")).toBe("true");
    expect(state("phase")).toBe("sending");

    await act(async () => answer(started({ type: "held" })));
    await settle(LETTER_TRACE_MS);
    expect(state("locked")).toBe("false");
  });

  it("sends what a bot filled in the hidden field, for the server to catch", async () => {
    renderMirror(WRITING);
    await settle();
    fireEvent.change(document.querySelector('input[name="website"]')!, { target: { value: "http://spam.example" } });

    await writeAndSend("Hola.");

    expect(JSON.parse(sentTo("/api/correspondences").body).honeypot).toBe("http://spam.example");
  });

  it("a send this screen didn't start (it was left mid-way) gives the paper back, with the draft", async () => {
    renderMirror({ ...WRITING, phase: "sending", draft: "A medio enviar." });
    await settle();

    expect(state("phase")).toBe("writing");
    expect(field().value).toBe("A medio enviar.");
    expect(calls("/api/correspondences")).toHaveLength(0);
  });

  it("can't be sent empty, or blank", async () => {
    renderMirror(WRITING);
    await settle();

    expect((button(P.send) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "   " } });
    expect((button(P.send) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(field().closest("form")!);
    await settle();
    expect(calls("/api/correspondences")).toHaveLength(0);
  });

  it("“Volver a su frase” after it left shows the phrase with the letter on its way, and no door", async () => {
    renderMirror(WRITING);
    await settle();
    await writeAndSend("Gracias.");

    fireEvent.click(button(L.backToPhrase)!);

    expect(screen.getByText(PHRASE)).toBeTruthy();
    expect(screen.getByText(L.onItsWay)).toBeTruthy();
    expect(door()).toBeNull();
  });

  it("a letter already on its way (another tab) ends on the envelope that left, without sending twice", async () => {
    answers["/api/correspondences"] = [started({ type: "not_allowed", reason: "awaiting_review" })];
    renderMirror(WRITING);
    await settle();

    await writeAndSend("Otra vez.");

    expect(state("phase")).toBe("sent");
    expect(screen.getByText(es.letterSend.headline)).toBeTruthy();
  });

  it.each([
    [
      "with contact details",
      started({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] }),
      `${N.contactFound.replace("{things}", es.letterNotice.contactKind.phone)} Quítalo y la carta podrá salir.`,
    ],
    ["held back by moderation", started({ type: "rejected", reason: "moderation" }), N.moderation],
    ["while letters are paused", Response.json({}, { status: 503 }), N.lettersClosed],
    ["after too many tries", Response.json({}, { status: 429 }), N.tooMany],
    ["with a server error", new Response("boom", { status: 500 }), N.failed],
    ["with no connection", new TypeError("Failed to fetch"), es.common.errors.couldntConnect],
  ])("a letter %s comes back on the paper, with why, and the draft kept", async (_label, answer, message) => {
    answers["/api/correspondences"] = [answer];
    renderMirror(WRITING);
    await settle();

    await writeAndSend("Mi número es 55 1234 5678.");

    expect(state("phase")).toBe("writing");
    expect(notice()).toContain(message.split(" Quítalo")[0]);
    expect(field().value).toBe("Mi número es 55 1234 5678.");
    expect(state("key")).toBe(SEAL);
  });

  it("a paper that came back can be sent again, with the same seal", async () => {
    answers["/api/correspondences"] = [started({ type: "rejected", reason: "moderation" }), started({ type: "held" })];
    renderMirror(WRITING);
    await settle();
    await writeAndSend("Primera vez.");

    fireEvent.change(field(), { target: { value: "Gracias por tu frase." } });
    fireEvent.click(button(P.send)!);
    await settle(LETTER_TRACE_MS);

    expect(calls("/api/correspondences")).toHaveLength(2);
    expect(sentTo("/api/correspondences", 1).headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(state("phase")).toBe("sent");
  });

  it("when the phrase can't receive it anymore, says so and doesn't let it be sent again", async () => {
    answers["/api/correspondences"] = [Response.json({ type: "phrase_not_connectable" }, { status: 403 })];
    renderMirror(WRITING);
    await settle();

    await writeAndSend("Hola.");

    expect(notice()).toBe(L.unavailable);
    expect((button(P.send) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a crisis gets help instead of a letter, lets the draft go, and goes back to the phrase", async () => {
    answers["/api/correspondences"] = [started({ type: "crisis", resourceUrl: "https://findahelpline.com" })];
    renderMirror(WRITING);
    await settle();

    await writeAndSend("No quiero seguir.");

    expect(screen.getByText(es.letterCrisis.intro)).toBeTruthy();
    expect(state("draft")).toBe("");
    fireEvent.click(button(L.backToPhrase)!);
    expect(door()).toBeTruthy();
    expect(screen.queryByLabelText(P.fieldLabel)).toBeNull();
  });

  it("“Ahora no” keeps the draft, and the door goes back to the paper", async () => {
    renderMirror(WRITING);
    await settle();
    fireEvent.change(field(), { target: { value: "Lo termino luego." } });

    fireEvent.click(button(P.notNow)!);
    expect(screen.getByText(PHRASE)).toBeTruthy();

    await openDoor();
    expect(field().value).toBe("Lo termino luego.");
    expect(calls("/api/return-key")).toHaveLength(0);
  });

  it("shows their phrase beside the paper, for the desktop layout", async () => {
    renderMirror(WRITING);
    await settle();

    expect(document.querySelector("[data-their-phrase]")?.textContent).toContain(PHRASE);
  });

  it("a letter for another entry's phrase is never picked up here", async () => {
    renderMirror({ ...WRITING, entryId: "entry-0", draft: "Para otra frase." });
    await settle();

    expect(door()).toBeTruthy();
    await openDoor();
    expect(calls("/api/return-key")).toHaveLength(1);
    expect(state("phase")).toBe("keeping");
  });

  it("speaks English with an English visitor", async () => {
    renderMirror(null, "en");
    await settle();

    expect(button(en.mirror.letter.writeButton)).toBeTruthy();
    expect(screen.getByText(en.mirror.letter.writeHint)).toBeTruthy();
  });
});

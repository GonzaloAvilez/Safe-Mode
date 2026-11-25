// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, pathnameMock } = vi.hoisted(() => ({ pushMock: vi.fn(), pathnameMock: vi.fn(() => "/es/observe") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }), usePathname: pathnameMock }));

import { useContributionState } from "@/app/_components/experience-state/contribution";
import { useMailboxState } from "@/app/_components/experience-state/mailbox";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import { useRitualState, type MirrorLetter } from "@/app/_components/experience-state/ritual";
import { OPEN_MAILBOX, OpenMailboxFromNotice, hasUnsentWords, mailboxPathFrom, type WordsInProgress } from "./open-mailbox-from-notice";

const ORIGIN = "http://localhost:3000";

describe("mailboxPathFrom", () => {
  it.each([
    [`${ORIGIN}/es/mailbox`, "/es/mailbox"],
    [`${ORIGIN}/en/mailbox`, "/en/mailbox"],
    ["/es/mailbox", "/es/mailbox"],
  ])("reads the mailbox path from %s", (url, path) => {
    expect(mailboxPathFrom({ type: OPEN_MAILBOX, url }, ORIGIN)).toBe(path);
  });

  // Only ever the mailbox on this site: the message can't send the page anywhere else.
  it.each([
    ["another message", { type: "something-else", url: `${ORIGIN}/es/mailbox` }],
    ["no url", { type: OPEN_MAILBOX }],
    ["a url that isn't a string", { type: OPEN_MAILBOX, url: 7 }],
    ["another site", { type: OPEN_MAILBOX, url: "https://example.com/es/mailbox" }],
    ["another page", { type: OPEN_MAILBOX, url: `${ORIGIN}/es/write` }],
    ["a page under the mailbox", { type: OPEN_MAILBOX, url: `${ORIGIN}/es/mailbox/x` }],
    ["an unsupported locale", { type: OPEN_MAILBOX, url: `${ORIGIN}/fr/mailbox` }],
    ["admin", { type: OPEN_MAILBOX, url: `${ORIGIN}/admin/mailbox` }],
    ["nothing", null],
    ["a string", OPEN_MAILBOX],
  ])("ignores %s", (_, data) => {
    expect(mailboxPathFrom(data, ORIGIN)).toBeNull();
  });
});

const NOTHING: WordsInProgress = {
  writeDraft: "",
  leaveATraceDraft: "",
  leaveATracePhase: "writing",
  mirrorLetter: null,
  letterDrafts: {},
  mailboxPhase: "showing_seal",
  contributionDraft: "",
};

const mirror = (phase: MirrorLetter["phase"], draft: string): MirrorLetter => ({
  entryId: "entry-1",
  phase,
  backOnPhrase: false,
  key: null,
  draft,
  outcome: null,
});

describe("hasUnsentWords", () => {
  it("is false with nothing written anywhere, or only spaces", () => {
    expect(hasUnsentWords(NOTHING)).toBe(false);
    expect(hasUnsentWords({ ...NOTHING, writeDraft: "   ", letterDrafts: { c1: " " } })).toBe(false);
  });

  it.each([
    ["an entry being written", { writeDraft: "Hoy me cuesta." }],
    ["a trace being written", { leaveATraceDraft: "Una frase.", leaveATracePhase: "writing" as const }],
    ["a trace waiting for the letters choice", { leaveATraceDraft: "Una frase.", leaveATracePhase: "choosing" as const }],
    ["a first letter being written", { mirrorLetter: mirror("writing", "Leí tu frase.") }],
    ["a first letter being sent", { mirrorLetter: mirror("sending", "") }],
    ["a reply being written in the mailbox", { letterDrafts: { c1: "", c2: "Gracias." } }],
    ["a reply being sent from the mailbox", { mailboxPhase: "sending" as const }],
    ["a phrase being written in Contribute", { contributionDraft: "Una frase semilla." }],
  ])("is true for %s", (_, state) => {
    expect(hasUnsentWords({ ...NOTHING, ...state })).toBe(true);
  });

  it.each([
    ["a trace already left", { leaveATraceDraft: "Una frase.", leaveATracePhase: "sealed" as const }],
    ["a first letter already on its way", { mirrorLetter: mirror("sent", "") }],
    ["a first letter whose paper is still empty", { mirrorLetter: mirror("writing", "") }],
  ])("is false for %s", (_, state) => {
    expect(hasUnsentWords({ ...NOTHING, ...state })).toBe(false);
  });
});

// A service worker container that tests can post messages through.
let serviceWorker: EventTarget;

function postFromWorker(data: unknown) {
  act(() => {
    serviceWorker.dispatchEvent(new MessageEvent("message", { data }));
  });
}

type Seed = { writeDraft?: string; letterDraft?: string; contributionDraft?: string };

function Seeded({ seed, children }: { seed: Seed; children: ReactNode }) {
  const ritual = useRitualState();
  const mailbox = useMailboxState();
  const contribution = useContributionState();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (seed.writeDraft) ritual.setWriteDraft(seed.writeDraft);
    if (seed.letterDraft) mailbox.setLetterDraft("c1", seed.letterDraft);
    if (seed.contributionDraft) contribution.setDraft(seed.contributionDraft);
    // Test-only: seeds the state once, then mounts the listener.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready ? <>{children}</> : null;
}

function renderListener(seed: Seed = {}) {
  return render(
    <ExperienceProviders>
      <Seeded seed={seed}>
        <OpenMailboxFromNotice />
      </Seeded>
    </ExperienceProviders>
  );
}

const openMailbox = (locale = "es") => ({ type: OPEN_MAILBOX, url: `${window.location.origin}/${locale}/mailbox` });

beforeEach(() => {
  serviceWorker = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  pathnameMock.mockReturnValue("/es/observe");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("OpenMailboxFromNotice", () => {
  it("goes to the mailbox the notice asks for when nothing is being written", () => {
    renderListener();

    postFromWorker(openMailbox("en"));

    expect(pushMock).toHaveBeenCalledWith("/en/mailbox");
  });

  it.each([
    ["an entry", { writeDraft: "Hoy me cuesta." }],
    ["a reply in the mailbox", { letterDraft: "Gracias." }],
    ["a phrase in Contribute", { contributionDraft: "Una frase semilla." }],
  ])("stays where it is while %s is being written", (_, seed) => {
    renderListener(seed);

    postFromWorker(openMailbox());

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does nothing when already on the mailbox, in either language", () => {
    pathnameMock.mockReturnValue("/en/mailbox");
    renderListener();

    postFromWorker(openMailbox("es"));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores any other message", () => {
    renderListener();

    postFromWorker({ type: OPEN_MAILBOX, url: "https://example.com/es/mailbox" });
    postFromWorker({ type: "other" });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("stops listening once it's gone", () => {
    const view = renderListener();
    view.unmount();

    postFromWorker(openMailbox());

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");

    expect(() => renderListener()).not.toThrow();
  });
});

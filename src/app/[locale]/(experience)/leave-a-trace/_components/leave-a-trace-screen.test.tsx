// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

// The closing scene draws on a canvas, which jsdom doesn't have; what matters here is which step shows.
vi.mock("../../gratitude/gratitude-canvas", () => ({ GratitudeCanvas: () => <div data-testid="closing-scene" /> }));
vi.mock("../../_shared/screen-header", () => ({ ScreenHeader: ({ tagline }: { tagline: string }) => <header>{tagline}</header> }));
vi.mock("../../_shared/screen-cta", () => ({ ScreenCta: ({ label }: { label: string }) => <span>{label}</span> }));
// jsdom draws no canvas and decodes no picture: the card's picture and its QR reading are stood in for.
vi.mock("@/lib/return-key-card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-card")>()),
  drawReturnKeyCardImage: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
}));
vi.mock("../../_shared/return-key/download-blob", () => ({ downloadBlob: () => {}, isIosDevice: () => false }));
vi.mock("../../_shared/return-key/read-seal-from-image", () => ({ readSealFromImage: () => Promise.resolve("482133901756229") }));

// ADR-005: stands in for the toggle, carrying the seal it was given (as an attribute, never as text).
vi.mock("../../_shared/notifications/letter-notifications-toggle", () => ({
  LetterNotificationsToggle: ({ returnKey }: { returnKey: string }) => <div data-testid="notifications-toggle" data-seal={returnKey} />,
}));

import { LeaveATraceScreen } from "./leave-a-trace-screen";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

// Leave a Trace's own words, with the ones its seal steps share with every other seal step.
const T = {
  ...es.leaveATrace,
  keep: { ...es.leaveATrace.keep, ...es.returnKey.keep },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeaveATraceScreen", () => {
  it("starts by asking for the trace", () => {
    renderStep(<LeaveATraceScreen lettersOpen={false} />, { phase: "writing" });

    expect(screen.getByText(T.writingHeadline)).toBeTruthy();
    expect(screen.getByPlaceholderText(T.placeholder)).toBeTruthy();
  });

  it("shows the choice after the trace, with the trace itself", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "choosing", draft: "Lo que no dije." });

    expect(screen.getByText(T.choice.headline)).toBeTruthy();
    expect(screen.getByText("“Lo que no dije.”")).toBeTruthy();
    expect(screen.getByText(T.writingTagline)).toBeTruthy();
  });

  it("shows the card after a yes, with its own tagline", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "keeping", key: { returnKey: SEAL, sentence: SENTENCE } });

    expect(screen.getByRole("img", { name: es.returnKeyCard.qrLabel })).toBeTruthy();
    expect(screen.getByText(T.keep.tagline)).toBeTruthy();
  });

  it.each(["submitted", "skipped"] as const)("shows the closing for a trace that is %s", (phase) => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase });

    expect(screen.getByTestId("closing-scene")).toBeTruthy();
    expect(screen.getByText(T.backToStart)).toBeTruthy();
    expect(screen.queryByText(T.choice.headline)).toBeNull();
  });

  // The sealed closing has two sentences, one per line: what the seal does, where the mailbox is.
  const [sealedSeal, sealedMailbox] = T.sealedSubcopy.split("\n");

  it("the sealed closing says what the seal does and, on a line of its own, where the mailbox is", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "sealed" });

    expect(screen.getByText(sealedSeal)).toBeTruthy();
    expect(screen.getByText(sealedMailbox)).toBeTruthy();
    expect(sealedMailbox).toBe("Tu buzón está en el sobre del inicio.");
  });

  // ADR-005: whoever sealed it waits for a first letter, so the sealed closing offers notices.
  it("the sealed closing offers letter notices with the seal still in memory", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "sealed", key: { returnKey: SEAL, sentence: SENTENCE } });

    expect(screen.getByTestId("notifications-toggle").getAttribute("data-seal")).toBe(SEAL);
  });

  it.each([
    ["a submitted trace", { phase: "submitted" as const }],
    ["a skipped trace", { phase: "skipped" as const }],
    ["a sealed closing whose seal is no longer in memory", { phase: "sealed" as const, key: null }],
  ])("offers no notices on %s", (_, seed) => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, seed);

    expect(screen.queryByTestId("notifications-toggle")).toBeNull();
  });

  it("the skipped closing carries its own line", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "skipped" });

    expect(screen.getByText(T.skippedSubcopy)).toBeTruthy();
  });

  it("only whoever sealed it is told the seal will open a letter", () => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "submitted" });

    expect(screen.queryByText(sealedSeal)).toBeNull();
    expect(screen.queryByText(sealedMailbox)).toBeNull();
    expect(screen.queryByText(T.skippedSubcopy)).toBeNull();
  });

  it("with letters open, the whole way: writing, the choice, the card, a sealed closing", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "/api/return-key/confirm"
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ ok: true, returnKey: SEAL, returnKeySentence: SENTENCE }), { status: 200 })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "writing" });

    fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: "Una frase." } });
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    fireEvent.click(await screen.findByRole("button", { name: T.choice.yes }));
    fireEvent.click(await screen.findByRole("button", { name: T.keep.save }));
    fireEvent.change(await screen.findByLabelText(T.keep.chooseImage), {
      target: { files: [new File(["png"], "refugio-sello.png", { type: "image/png" })] },
    });

    await screen.findByText(sealedMailbox, {}, { timeout: 4000 });
    expect(screen.getByTestId("closing-scene")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/return-key/confirm", expect.objectContaining({ headers: { Authorization: `Bearer ${SEAL}` } }));
    // Kept on the closing, which offers letter notices with it (ADR-005).
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
  });

  it("with letters closed, a trace goes straight to the closing, never asking about letters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    renderStep(<LeaveATraceScreen lettersOpen={false} />, { phase: "writing" });

    fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: "Una frase." } });
    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(screen.getByTestId("closing-scene")).toBeTruthy());
    expect(screen.queryByText(T.choice.headline)).toBeNull();
  });

  // The phrase is sent from the choice, a different component than the form that showed the hidden
  // field: whatever a bot put there while writing has to reach the server all the same.
  describe("the bot trap on the way from writing to the choice", () => {
    const hiddenField = (container: HTMLElement) => container.querySelector('input[name="website"]') as HTMLInputElement;
    const phraseSent = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body);

    function startWriting() {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const { container } = renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "writing" });
      fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: "Una frase." } });
      return { fetchMock, container };
    }

    it.each([
      ["“Así está bien”", T.choice.no],
      ["“Sí, quiero un sello”", T.choice.yes],
    ])("a field filled while writing still counts when the person answers %s", async (_label, answer) => {
      const { fetchMock, container } = startWriting();

      fireEvent.change(hiddenField(container), { target: { value: "http://spam.example" } });
      fireEvent.click(screen.getByRole("button", { name: T.submit }));
      await screen.findByText(T.choice.headline);
      fireEvent.click(screen.getByRole("button", { name: answer }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(phraseSent(fetchMock).honeypot).toBe("http://spam.example");
    });

    it("a field filled only in the choice counts too", async () => {
      const { fetchMock, container } = startWriting();

      fireEvent.click(screen.getByRole("button", { name: T.submit }));
      await screen.findByText(T.choice.headline);
      fireEvent.change(hiddenField(container), { target: { value: "http://spam.example" } });
      fireEvent.click(screen.getByRole("button", { name: T.choice.no }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(phraseSent(fetchMock).honeypot).toBe("http://spam.example");
    });

    it("a person who never touches the hidden field sends it empty", async () => {
      const { fetchMock } = startWriting();

      fireEvent.click(screen.getByRole("button", { name: T.submit }));
      await screen.findByText(T.choice.headline);
      fireEvent.click(screen.getByRole("button", { name: T.choice.no }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(phraseSent(fetchMock).honeypot).toBe("");
    });
  });

  it("with letters open, goes from writing to the choice, to the card, to the closing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, returnKey: SEAL, returnKeySentence: SENTENCE }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase: "writing" });

    fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: "Una frase." } });
    fireEvent.click(screen.getByRole("button", { name: T.submit }));
    await screen.findByText(T.choice.headline);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: T.choice.yes }));
    await screen.findByRole("img", { name: es.returnKeyCard.qrLabel });
    expect(fetchMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: T.keep.withoutLetters }));
    await waitFor(() => expect(screen.getByTestId("closing-scene")).toBeTruthy());
    expect(screen.getByTestId("key").textContent).toBe("");
  });
});

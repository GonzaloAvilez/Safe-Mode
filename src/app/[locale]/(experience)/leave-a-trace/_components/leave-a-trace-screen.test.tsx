// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

// The closing scene draws on a canvas, which jsdom doesn't have; what matters here is which step shows.
vi.mock("../../gratitude/gratitude-canvas", () => ({ GratitudeCanvas: () => <div data-testid="closing-scene" /> }));
vi.mock("../../_shared/screen-header", () => ({ ScreenHeader: ({ tagline }: { tagline: string }) => <header>{tagline}</header> }));
vi.mock("../../_shared/screen-cta", () => ({ ScreenCta: ({ label }: { label: string }) => <span>{label}</span> }));

import { LeaveATraceScreen } from "./leave-a-trace-screen";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

const T = es.leaveATrace;

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

    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(screen.getByText(T.keep.tagline)).toBeTruthy();
  });

  it.each(["submitted", "skipped"] as const)("shows the closing for a trace that is %s", (phase) => {
    renderStep(<LeaveATraceScreen lettersOpen={true} />, { phase });

    expect(screen.getByTestId("closing-scene")).toBeTruthy();
    expect(screen.getByText(T.backToStart)).toBeTruthy();
    expect(screen.queryByText(T.choice.headline)).toBeNull();
  });

  it("with letters closed, a trace goes straight to the closing, never asking about letters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    renderStep(<LeaveATraceScreen lettersOpen={false} />, { phase: "writing" });

    fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: "Una frase." } });
    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(screen.getByTestId("closing-scene")).toBeTruthy());
    expect(screen.queryByText(T.choice.headline)).toBeNull();
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
    await screen.findByText("48213 · 39017 · 56229");
    expect(fetchMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: T.keep.withoutLetters }));
    await waitFor(() => expect(screen.getByTestId("closing-scene")).toBeTruthy());
    expect(screen.getByTestId("key").textContent).toBe("");
  });
});

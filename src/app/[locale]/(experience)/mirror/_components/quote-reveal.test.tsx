// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteReveal } from "./quote-reveal";

const TEXT = "Sigo aquí.";

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce, media: query }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("QuoteReveal", () => {
  it("shows the phrase one letter at a time, and says it's done only once the last one is showing", () => {
    const onRevealed = vi.fn();
    const { container } = render(<QuoteReveal text={TEXT} onRevealed={onRevealed} />);

    expect(container.textContent).toBe("");
    act(() => vi.advanceTimersByTime(35 * 4));
    expect(container.textContent).toBe("Sigo");
    expect(onRevealed).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(35 * (TEXT.length - 5)));
    expect(container.textContent).toBe(TEXT.slice(0, -1));
    expect(onRevealed).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(35));
    expect(container.textContent).toBe(TEXT);
    expect(onRevealed).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(35 * 20));
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { why: "instant", instant: true, reduce: false },
    { why: "reduced motion", instant: false, reduce: true },
  ])("shows it all at once, and says so right away ($why)", ({ instant, reduce }) => {
    stubReducedMotion(reduce);
    const onRevealed = vi.fn();
    const { container } = render(<QuoteReveal text={TEXT} instant={instant} onRevealed={onRevealed} />);

    expect(container.textContent).toBe(TEXT);
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it("a new callback mid-way doesn't start the phrase over", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(<QuoteReveal text={TEXT} onRevealed={first} />);
    act(() => vi.advanceTimersByTime(35 * 4));

    rerender(<QuoteReveal text={TEXT} onRevealed={second} />);
    expect(container.textContent).toBe("Sigo");
    act(() => vi.advanceTimersByTime(35 * TEXT.length));

    expect(container.textContent).toBe(TEXT);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("turning instant on mid-way changes nothing: it's read when the phrase first shows", () => {
    const onRevealed = vi.fn();
    const { container, rerender } = render(<QuoteReveal text={TEXT} onRevealed={onRevealed} />);
    act(() => vi.advanceTimersByTime(35 * 4));

    rerender(<QuoteReveal text={TEXT} instant onRevealed={onRevealed} />);

    expect(container.textContent).toBe("Sigo");
    expect(onRevealed).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(35 * TEXT.length));
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });
});

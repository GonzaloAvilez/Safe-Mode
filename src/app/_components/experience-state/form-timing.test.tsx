// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormTimingProvider, useFormTiming, type ExperienceForm } from "./form-timing";

const wrapper = ({ children }: { children: ReactNode }) => <FormTimingProvider>{children}</FormTimingProvider>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("form timing across a new ritual", () => {
  it.each<[ExperienceForm, boolean]>([
    ["write", true],
    ["leave-a-trace", true],
    ["mirror-letter", true],
    ["letter", false], // the mailbox is outside the ritual
    ["contribute", false],
  ])("a new ritual starts %s's clock and hidden field again: %s", (form, startsAgain) => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { result } = renderHook(() => useFormTiming(), { wrapper });
    act(() => {
      result.current.setRenderedAt(form, 500);
      result.current.setHoneypotValue(form, "http://spam.example");
    });

    vi.setSystemTime(9000);
    act(() => result.current.resetRitualTimings());

    expect(result.current.getRenderedAt(form)).toBe(startsAgain ? 9000 : 500);
    expect(result.current.getHoneypotValue(form)).toBe(startsAgain ? "" : "http://spam.example");
  });
});

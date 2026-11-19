// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RitualStateProvider, useRitualState } from "./ritual";

const wrapper = ({ children }: { children: ReactNode }) => <RitualStateProvider>{children}</RitualStateProvider>;

afterEach(() => {
  cleanup();
});

describe("ritual state, Leave a Trace", () => {
  it("starts writing, with no draft and no seal", () => {
    const { result } = renderHook(() => useRitualState(), { wrapper });

    expect(result.current.leaveATracePhase).toBe("writing");
    expect(result.current.leaveATraceDraft).toBe("");
    expect(result.current.leaveATraceKey).toBeNull();
  });

  it("returning home starts a new ritual: the draft, the step and the seal are all let go", () => {
    const { result } = renderHook(() => useRitualState(), { wrapper });
    act(() => {
      result.current.setLeaveATraceDraft("Lo que no dije.");
      result.current.setLeaveATracePhase("keeping");
      result.current.setLeaveATraceKey({ returnKey: "482133901756229", sentence: "Estuviste aquí." });
      result.current.setLeaveATraceLastAsked(2);
    });
    expect(result.current.leaveATraceKey).not.toBeNull();

    act(() => result.current.clearRitualState());

    expect(result.current.leaveATraceDraft).toBe("");
    expect(result.current.leaveATracePhase).toBe("writing");
    expect(result.current.leaveATraceKey).toBeNull();
    expect(result.current.leaveATraceLastAsked).toBeNull();
  });

  it("returning home also lets go of a letter from Mirror, its seal and its draft", () => {
    const { result } = renderHook(() => useRitualState(), { wrapper });
    act(() =>
      result.current.setMirrorLetter({
        entryId: "entry-1",
        phase: "writing",
        backOnPhrase: false,
        key: { returnKey: "482133901756229", sentence: "Estuviste aquí." },
        lastAsked: 1,
        draft: "Leí tu frase.",
        outcome: null,
      })
    );
    expect(result.current.mirrorLetter).not.toBeNull();

    act(() => result.current.clearRitualState());

    expect(result.current.mirrorLetter).toBeNull();
  });

  it("keeps the seal in memory only: nothing is written to the browser's storage", () => {
    localStorage.clear();
    sessionStorage.clear();
    const { result } = renderHook(() => useRitualState(), { wrapper });

    act(() => result.current.setLeaveATraceKey({ returnKey: "482133901756229", sentence: "Estuviste aquí." }));

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

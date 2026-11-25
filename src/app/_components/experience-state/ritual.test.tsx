// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The page the provider sits on. Outside the app router there's no path (null).
const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn<() => string | null>(() => null) }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

import { RitualStateProvider, useRitualState, type MirrorLetter } from "./ritual";

const wrapper = ({ children }: { children: ReactNode }) => <RitualStateProvider>{children}</RitualStateProvider>;

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
  pathnameMock.mockReturnValue(null);
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
    });
    expect(result.current.leaveATraceKey).not.toBeNull();

    act(() => result.current.clearRitualState());

    expect(result.current.leaveATraceDraft).toBe("");
    expect(result.current.leaveATracePhase).toBe("writing");
    expect(result.current.leaveATraceKey).toBeNull();
  });

  it("returning home also lets go of a letter from Mirror, its seal and its draft", () => {
    const { result } = renderHook(() => useRitualState(), { wrapper });
    act(() =>
      result.current.setMirrorLetter({
        entryId: "entry-1",
        phase: "writing",
        backOnPhrase: false,
        key: { returnKey: "482133901756229", sentence: "Estuviste aquí." },
        draft: "Leí tu frase.",
        outcome: null,
      })
    );
    expect(result.current.mirrorLetter).not.toBeNull();

    act(() => result.current.clearRitualState());

    expect(result.current.mirrorLetter).toBeNull();
  });

  it("tells a request apart from one started before a new ritual", () => {
    const { result } = renderHook(() => useRitualState(), { wrapper });
    const isBeforeReset = result.current.startRitualOperation();
    expect(isBeforeReset()).toBe(true);

    act(() => result.current.clearRitualState());
    const isAfterReset = result.current.startRitualOperation();

    expect(isBeforeReset()).toBe(false);
    expect(isAfterReset()).toBe(true);
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

// ADR-005: both closings keep their seal in memory to offer letter notices, and let it go once the
// person leaves them for another page. Switching language keeps the same page.
describe("ritual state, a closing's seal", () => {
  const TRACE_SEAL = { returnKey: "482133901756229", sentence: "Estuviste aquí." };
  const MIRROR_SEAL = { returnKey: "917306552840113", sentence: "Una frase." };
  const mirrorLetter = (phase: MirrorLetter["phase"]): MirrorLetter => ({
    entryId: "entry-1",
    phase,
    backOnPhrase: false,
    key: MIRROR_SEAL,
    draft: "",
    outcome: null,
  });

  function renderOn(pathname: string) {
    pathnameMock.mockReturnValue(pathname);
    const hook = renderHook(() => useRitualState(), { wrapper });
    return {
      result: hook.result,
      goTo(next: string | null) {
        pathnameMock.mockReturnValue(next);
        hook.rerender();
      },
    };
  }

  it("stays on the sealed closing in either language, and is let go once the person leaves it", () => {
    const { result, goTo } = renderOn("/es/leave-a-trace");
    act(() => {
      result.current.setLeaveATracePhase("sealed");
      result.current.setLeaveATraceKey(TRACE_SEAL);
    });

    goTo("/en/leave-a-trace");
    expect(result.current.leaveATraceKey).toEqual(TRACE_SEAL);

    goTo("/en/mailbox");
    expect(result.current.leaveATraceKey).toBeNull();
    expect(result.current.leaveATracePhase).toBe("sealed");
  });

  // A seal still being kept waits for whoever comes back to it, as before.
  it("isn't touched while it's still being kept", () => {
    const { result, goTo } = renderOn("/es/leave-a-trace");
    act(() => {
      result.current.setLeaveATracePhase("keeping");
      result.current.setLeaveATraceKey(TRACE_SEAL);
    });

    goTo("/es/observe");

    expect(result.current.leaveATraceKey).toEqual(TRACE_SEAL);
  });

  it("stays on Mirror's closing in either language, and is let go once the person leaves Mirror", () => {
    const { result, goTo } = renderOn("/es/mirror");
    act(() => result.current.setMirrorLetter(mirrorLetter("sent")));

    goTo("/en/mirror");
    expect(result.current.mirrorLetter?.key).toEqual(MIRROR_SEAL);

    goTo("/en");
    // Only the seal goes: the letter is still on its way.
    expect(result.current.mirrorLetter).toMatchObject({ phase: "sent", key: null, entryId: "entry-1" });
  });

  // #285 review: the closing can be reached after the person already left its page.
  it("lets go of Mirror's seal when the letter finishes sending after the person left Mirror", () => {
    const { result, goTo } = renderOn("/es/mirror");
    act(() => result.current.setMirrorLetter(mirrorLetter("sending")));

    goTo("/es");
    expect(result.current.mirrorLetter?.key).toEqual(MIRROR_SEAL);

    act(() => result.current.setMirrorLetter((letter) => (letter ? { ...letter, phase: "sent" } : letter)));
    expect(result.current.mirrorLetter).toMatchObject({ phase: "sent", key: null });
  });

  it("lets go of Leave a Trace's seal when sealing lands after the person left", () => {
    const { result, goTo } = renderOn("/es/leave-a-trace");
    act(() => {
      result.current.setLeaveATracePhase("keeping");
      result.current.setLeaveATraceKey(TRACE_SEAL);
    });

    goTo("/es/observe");
    expect(result.current.leaveATraceKey).toEqual(TRACE_SEAL);

    act(() => result.current.setLeaveATracePhase("sealed"));
    expect(result.current.leaveATraceKey).toBeNull();
  });

  it("isn't touched for a Mirror letter that hasn't left yet", () => {
    const { result, goTo } = renderOn("/es/mirror");
    act(() => result.current.setMirrorLetter(mirrorLetter("writing")));

    goTo("/es/observe");

    expect(result.current.mirrorLetter?.key).toEqual(MIRROR_SEAL);
  });

  it("does nothing where there's no path (outside the app router)", () => {
    const { result, goTo } = renderOn("/es/leave-a-trace");
    act(() => {
      result.current.setLeaveATracePhase("sealed");
      result.current.setLeaveATraceKey(TRACE_SEAL);
    });

    goTo(null);

    expect(result.current.leaveATraceKey).toEqual(TRACE_SEAL);
  });
});

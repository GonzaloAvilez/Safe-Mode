// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MailboxStateProvider, useMailboxState } from "./mailbox";

const wrapper = ({ children }: { children: ReactNode }) => <MailboxStateProvider>{children}</MailboxStateProvider>;
const SEAL = "482133901756229";
const MAILBOX = { correspondences: [] };

afterEach(() => {
  cleanup();
});

describe("mailbox state", () => {
  it("starts closed, asking for the seal", () => {
    const { result } = renderHook(() => useMailboxState(), { wrapper });

    expect(result.current.mailboxPhase).toBe("showing_seal");
    expect(result.current.mailboxReturnKey).toBeNull();
    expect(result.current.mailbox).toBeNull();
    expect(result.current.openCorrespondenceId).toBeNull();
  });

  it("closing the mailbox lets go of the seal, the letters and the open correspondence", () => {
    const { result } = renderHook(() => useMailboxState(), { wrapper });
    act(() => {
      result.current.setMailboxReturnKey(SEAL);
      result.current.setMailbox(MAILBOX);
      result.current.setMailboxPhase("reading");
      result.current.setOpenCorrespondenceId("c1");
      result.current.setLetterDraft("c1", "A medias.");
      result.current.setLetterDraft("c2", "Otra.");
      result.current.setLetterOutcome({ type: "crisis" });
    });

    act(() => result.current.clearMailboxState());

    expect(result.current.letterDrafts).toEqual({});
    expect(result.current.letterOutcome).toBeNull();
    expect(result.current.mailboxReturnKey).toBeNull();
    expect(result.current.mailbox).toBeNull();
    expect(result.current.mailboxPhase).toBe("showing_seal");
    expect(result.current.openCorrespondenceId).toBeNull();
  });

  it("an operation started before the mailbox was closed is no longer current; one started after is", () => {
    const { result } = renderHook(() => useMailboxState(), { wrapper });
    const before = result.current.startMailboxOperation();
    expect(before()).toBe(true);

    act(() => result.current.clearMailboxState());
    const after = result.current.startMailboxOperation();

    expect(before()).toBe(false);
    expect(after()).toBe(true);
  });

  it("keeps the seal in memory only: nothing is written to the browser's storage", () => {
    localStorage.clear();
    sessionStorage.clear();
    const { result } = renderHook(() => useMailboxState(), { wrapper });

    act(() => {
      result.current.setMailboxReturnKey(SEAL);
      result.current.setMailbox(MAILBOX);
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe("mailbox state, drafts", () => {
  it("keeps one draft per correspondence: writing to one never touches another's", () => {
    const { result } = renderHook(() => useMailboxState(), { wrapper });

    act(() => {
      result.current.setLetterDraft("c1", "Para quien escribió primero.");
      result.current.setLetterDraft("c2", "Para la otra persona.");
    });
    act(() => result.current.setLetterDraft("c1", ""));

    expect(result.current.letterDrafts).toEqual({ c1: "", c2: "Para la otra persona." });
  });
});

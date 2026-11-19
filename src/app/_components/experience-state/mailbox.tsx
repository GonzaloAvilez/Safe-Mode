"use client";

import { useCallback, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { SendLetterResult } from "@/app/[locale]/(experience)/_shared/letters/send-letter";
import type { Mailbox } from "@/lib/mailbox";
import { createStrictContext } from "./create-strict-context";

// ADR-004 #213: the mailbox, opened with a seal. "showing_seal" asks for the seal (its picture or
// its numbers), "correspondences" shows the envelopes, "reading" one correspondence's letters,
// one at a time. "writing" is the next letter on paper, "sending" the envelope closing while it's
// sent, "sent" the envelope leaving (design B5 and B6).
export type MailboxPhase = "showing_seal" | "correspondences" | "reading" | "writing" | "sending" | "sent";

type MailboxState = {
  // The seal that opened the mailbox. Memory only, like the ritual's seal: never in the URL,
  // never in browser storage, gone on reload or when the mailbox is closed.
  mailboxReturnKey: string | null;
  setMailboxReturnKey: Dispatch<SetStateAction<string | null>>;
  mailbox: Mailbox | null;
  setMailbox: Dispatch<SetStateAction<Mailbox | null>>;
  mailboxPhase: MailboxPhase;
  setMailboxPhase: Dispatch<SetStateAction<MailboxPhase>>;
  openCorrespondenceId: string | null;
  setOpenCorrespondenceId: Dispatch<SetStateAction<string | null>>;
  // The letters being written, one per correspondence (by its id), kept like the ritual's drafts:
  // memory only, and they survive a language switch. Never one draft for the whole mailbox: what
  // someone began writing to one person must never appear in a letter to another.
  letterDrafts: Readonly<Record<string, string>>;
  setLetterDraft: (correspondenceId: string, text: string) => void;
  // What the last send came back with, when the letter didn't leave (a crisis, a rejection, a
  // pause), so what it says to the person survives a language switch too.
  letterOutcome: SendLetterResult | null;
  setLetterOutcome: Dispatch<SetStateAction<SendLetterResult | null>>;
  // Marks the start of something that will open the mailbox when it finishes (reading the
  // picture, fetching the mailbox). The returned check says whether its result may still be
  // used: not once the mailbox was closed in the meantime.
  startMailboxOperation: () => () => boolean;
  clearMailboxState: () => void;
};

const [MailboxStateContext, useMailboxState] = createStrictContext<MailboxState>("useMailboxState");

// Above the locale segment, like the ritual state: switching language keeps the mailbox open.
export function MailboxStateProvider({ children }: { children: ReactNode }) {
  const [mailboxReturnKey, setMailboxReturnKey] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [mailboxPhase, setMailboxPhase] = useState<MailboxPhase>("showing_seal");
  const [openCorrespondenceId, setOpenCorrespondenceId] = useState<string | null>(null);
  const [letterDrafts, setLetterDrafts] = useState<Readonly<Record<string, string>>>({});

  const setLetterDraft = useCallback((correspondenceId: string, text: string) => {
    setLetterDrafts((drafts) => ({ ...drafts, [correspondenceId]: text }));
  }, []);
  const [letterOutcome, setLetterOutcome] = useState<SendLetterResult | null>(null);
  // Bumped every time the mailbox is closed. An operation started before that belongs to a
  // mailbox that no longer exists, so its result must not reopen it: whoever left mid-request
  // would otherwise find it open on coming back, without having shown the seal.
  const generation = useRef(0);

  const startMailboxOperation = useCallback(() => {
    const startedIn = generation.current;
    return () => startedIn === generation.current;
  }, []);

  const clearMailboxState = useCallback(() => {
    generation.current += 1;
    setMailboxReturnKey(null);
    setMailbox(null);
    setMailboxPhase("showing_seal");
    setOpenCorrespondenceId(null);
    setLetterDrafts({});
    setLetterOutcome(null);
  }, []);

  return (
    <MailboxStateContext.Provider
      value={{
        mailboxReturnKey,
        setMailboxReturnKey,
        mailbox,
        setMailbox,
        mailboxPhase,
        setMailboxPhase,
        openCorrespondenceId,
        setOpenCorrespondenceId,
        letterDrafts,
        setLetterDraft,
        letterOutcome,
        setLetterOutcome,
        startMailboxOperation,
        clearMailboxState,
      }}
    >
      {children}
    </MailboxStateContext.Provider>
  );
}

export { useMailboxState };

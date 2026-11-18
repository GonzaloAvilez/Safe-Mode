"use client";

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Mailbox } from "@/lib/mailbox";
import { createStrictContext } from "./create-strict-context";

// ADR-004 #213: the mailbox, opened with a seal. "showing_seal" asks for the seal (its picture or
// its numbers), "correspondences" shows the envelopes, "reading" one correspondence's letters,
// one at a time.
export type MailboxPhase = "showing_seal" | "correspondences" | "reading";

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
  clearMailboxState: () => void;
};

const [MailboxStateContext, useMailboxState] = createStrictContext<MailboxState>("useMailboxState");

// Above the locale segment, like the ritual state: switching language keeps the mailbox open.
export function MailboxStateProvider({ children }: { children: ReactNode }) {
  const [mailboxReturnKey, setMailboxReturnKey] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [mailboxPhase, setMailboxPhase] = useState<MailboxPhase>("showing_seal");
  const [openCorrespondenceId, setOpenCorrespondenceId] = useState<string | null>(null);

  const clearMailboxState = useCallback(() => {
    setMailboxReturnKey(null);
    setMailbox(null);
    setMailboxPhase("showing_seal");
    setOpenCorrespondenceId(null);
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
        clearMailboxState,
      }}
    >
      {children}
    </MailboxStateContext.Provider>
  );
}

export { useMailboxState };

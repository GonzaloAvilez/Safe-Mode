"use client";

import { useEffect, useEffectEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useContributionState } from "@/app/_components/experience-state/contribution";
import { useMailboxState, type MailboxPhase } from "@/app/_components/experience-state/mailbox";
import { useRitualState, type LeaveATracePhase, type MirrorLetter } from "@/app/_components/experience-state/ritual";
import { isLocale } from "@/lib/locale";

// ADR-005: someone tapped a letter notice while Refugio was already open. The service worker
// (public/sw.js) focuses this window and posts OPEN_MAILBOX instead of navigating it, because only
// the page knows whether it holds words not yet sent. With none, the page goes to the mailbox.
// With some, it stays where it is: nobody is pulled away from what they're writing or sending.
//
// It's only a request to go to the mailbox, never a way past it: the mailbox still asks for the
// seal's picture, unless this visit already opened it.

// The same string as in public/sw.js, which isn't bundled.
export const OPEN_MAILBOX = "refugio:open-mailbox";

// The mailbox path a message asks for, or null for anything else: only `/{locale}/mailbox` on this
// site, whatever else the message says.
export function mailboxPathFrom(data: unknown, origin: string): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  if (type !== OPEN_MAILBOX || typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  const [, locale, page, ...rest] = parsed.pathname.split("/");
  return isLocale(locale) && page === "mailbox" && rest.length === 0 ? `/${locale}/mailbox` : null;
}

export type WordsInProgress = {
  writeDraft: string;
  leaveATraceDraft: string;
  leaveATracePhase: LeaveATracePhase;
  mirrorLetter: MirrorLetter | null;
  letterDrafts: Readonly<Record<string, string>>;
  mailboxPhase: MailboxPhase;
  contributionDraft: string;
};

const hasWords = (text: string) => text.trim() !== "";

// Words someone wrote and hasn't sent yet, or a send still on its way, anywhere in Refugio.
export function hasUnsentWords(state: WordsInProgress): boolean {
  // Leave a Trace sends its phrase when the person answers the choice, so until then it's unsent.
  const traceUnsent = (state.leaveATracePhase === "writing" || state.leaveATracePhase === "choosing") && hasWords(state.leaveATraceDraft);
  const letter = state.mirrorLetter;
  const mirrorUnsent = letter !== null && (letter.phase === "sending" || (letter.phase === "writing" && hasWords(letter.draft)));
  const mailboxUnsent = state.mailboxPhase === "sending" || Object.values(state.letterDrafts).some(hasWords);
  return hasWords(state.writeDraft) || traceUnsent || mirrorUnsent || mailboxUnsent || hasWords(state.contributionDraft);
}

const isMailboxPage = (pathname: string | null) => pathname !== null && /^\/(en|es)\/mailbox$/.test(pathname);

export function OpenMailboxFromNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const ritual = useRitualState();
  const { letterDrafts, mailboxPhase } = useMailboxState();
  const { draft: contributionDraft } = useContributionState();

  // Reads the state as it is when the message arrives.
  const onMessage = useEffectEvent((event: MessageEvent) => {
    const path = mailboxPathFrom(event.data, window.location.origin);
    if (!path || isMailboxPage(pathname)) return;
    const unsent = hasUnsentWords({
      writeDraft: ritual.writeDraft,
      leaveATraceDraft: ritual.leaveATraceDraft,
      leaveATracePhase: ritual.leaveATracePhase,
      mirrorLetter: ritual.mirrorLetter,
      letterDrafts,
      mailboxPhase,
      contributionDraft,
    });
    if (!unsent) router.push(path);
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const listener = (event: MessageEvent) => onMessage(event);
    container.addEventListener("message", listener);
    return () => container.removeEventListener("message", listener);
  }, []);

  return null;
}

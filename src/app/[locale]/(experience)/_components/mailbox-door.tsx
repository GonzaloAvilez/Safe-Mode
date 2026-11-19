"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// ADR-004 #213, design B1: the way back to the mailbox, an envelope under the sound toggle, on Home
// only (founder decision 2026-11-18: not on every screen, so it never pulls someone out of the
// ritual). Only while letters are open: with letters closed there's nothing to come back for yet.
//
// `lettersOpen` is the same unawaited promise Home hands RulesGate, so the door waits for it on
// its own and never holds the page.
export function MailboxDoor({ lettersOpen }: { lettersOpen: Promise<boolean> }) {
  const t = useTranslations("home");
  if (!use(lettersOpen)) return null;

  return (
    <Link
      href="/mailbox"
      aria-label={t("mailboxDoor")}
      title={t("mailboxDoor")}
      className="fixed top-36 right-12 z-20 flex size-11 items-center justify-center rounded-full border border-[rgba(242,192,99,0.35)] text-[rgba(242,192,99,0.85)] transition-colors duration-300 hover:border-[rgba(242,192,99,0.7)] hover:text-[#f2c063] focus-visible:border-[#f2c063] focus-visible:outline-none"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
        <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
      </svg>
    </Link>
  );
}

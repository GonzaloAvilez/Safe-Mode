"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useMailboxState } from "@/app/_components/experience-state/mailbox";
import { Link } from "@/i18n/navigation";
import type { MailboxCorrespondence } from "@/lib/mailbox";
import { ScreenCta } from "../../_shared/screen-cta";
import { ScreenHeader } from "../../_shared/screen-header";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { CorrespondenceList } from "./correspondence-list";
import { LetterPaper } from "./letter-paper";
import { ShowSealStep } from "./show-seal-step";

// ADR-004 #213: the mailbox (design B, "cartas en papel"). Whoever holds a seal comes back here to
// read the letters on their correspondences: the author of a phrase, or the visitor who wrote to
// them. The seal opens it (ShowSealStep), the correspondences are envelopes (CorrespondenceList),
// and each one's letters are read one at a time, on paper (LetterPaper).
//
// The seal and the letters live only in memory (MailboxStateProvider): a reload or "close my
// mailbox" asks for the seal again. Reading works whether or not letters are open: someone who
// already has letters can always read them.

function MailboxShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>

      <ScreenHeader tagline={tagline} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 pt-40 pb-16">{children}</div>
    </>
  );
}

function CloseMailboxLink({ label }: { label: string }) {
  const { clearMailboxState } = useMailboxState();
  return (
    <Link
      href="/"
      onClick={clearMailboxState}
      className="text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75"
    >
      {label}
    </Link>
  );
}

// One correspondence, one letter at a time: it opens on the latest letter, and the others are a
// tap away.
function CorrespondenceReader({ correspondence, onBack }: { correspondence: MailboxCorrespondence; onBack: () => void }) {
  const t = useTranslations("mailbox");
  const { letters } = correspondence;
  const [index, setIndex] = useState(letters.length - 1);
  // Read once: the paper says how long ago each letter was written, and that shouldn't shift while
  // someone is reading.
  const [now] = useState(() => new Date());
  const letter = letters[index];

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="text-center">
        <div className="text-[10px] tracking-[3px] text-white/45 uppercase">
          {correspondence.yourSide === "author" ? t("list.aboutYourTrace") : t("list.toAPhrase")}
        </div>
        <p className="mt-1.5 text-[14px] text-white/75">“{correspondence.phraseText}”</p>
      </div>

      {letter && <LetterPaper key={index} letter={letter} number={index + 1} yourSide={correspondence.yourSide} now={now} />}

      {letters.length > 1 && (
        <nav className="flex items-center gap-2" aria-label={t("letter.turns")}>
          <button
            type="button"
            onClick={() => setIndex(index - 1)}
            disabled={index === 0}
            aria-label={t("letter.previous")}
            className="flex size-11 items-center justify-center text-[18px] text-white/70 disabled:text-white/20"
          >
            ‹
          </button>
          {letters.map((each, position) => {
            const yours = each.sender === correspondence.yourSide;
            const current = position === index;
            return (
              <button
                key={position}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={t("letter.goTo", { number: position + 1 })}
                aria-current={current ? "true" : undefined}
                className="flex size-7 items-center justify-center"
              >
                <span
                  className={`block rounded-full transition-all duration-300 ${current ? "size-2.5" : "size-2"} ${
                    yours ? "border border-[rgba(242,192,99,0.7)]" : "bg-[#f2ede3]"
                  } ${current && yours ? "bg-[rgba(242,192,99,0.7)]" : ""}`}
                />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            disabled={index === letters.length - 1}
            aria-label={t("letter.next")}
            className="flex size-11 items-center justify-center text-[18px] text-white/70 disabled:text-white/20"
          >
            ›
          </button>
        </nav>
      )}
      <p className="-mt-3 text-center text-[11px] text-white/40">{t("letter.turns")}</p>

      <button
        type="button"
        onClick={onBack}
        className="text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75"
      >
        {t("letter.back")}
      </button>
    </div>
  );
}

export function MailboxScreen() {
  const t = useTranslations("mailbox");
  const {
    mailbox,
    mailboxReturnKey,
    mailboxPhase: phase,
    setMailboxPhase: setPhase,
    openCorrespondenceId,
    setOpenCorrespondenceId,
    clearMailboxState,
  } = useMailboxState();

  // Nothing opened yet, or the seal is no longer in memory: the mailbox asks for it.
  if (phase === "showing_seal" || !mailbox || !mailboxReturnKey) {
    return (
      <MailboxShell tagline={t("tagline")}>
        <ShowSealStep />
        <CloseMailboxLink label={t("backToStart")} />
      </MailboxShell>
    );
  }

  if (mailbox.correspondences.length === 0) {
    return (
      <>
        <MailboxShell tagline={t("insideTagline")}>
          <ScreenPrompt headline={t("empty.headline")} subcopy={t("empty.subcopy")} />
          <p className="text-center text-[11px] text-white/40">{t("empty.kept")}</p>
        </MailboxShell>
        <ScreenCta href="/" label={t("backToStart")} accentRgb="210,158,32" onClick={clearMailboxState} />
      </>
    );
  }

  const reading =
    phase === "reading" ? mailbox.correspondences.find((correspondence) => correspondence.id === openCorrespondenceId) : undefined;

  if (reading) {
    return (
      <MailboxShell tagline={t("insideTagline")}>
        <CorrespondenceReader
          key={reading.id}
          correspondence={reading}
          onBack={() => {
            setOpenCorrespondenceId(null);
            setPhase("correspondences");
          }}
        />
      </MailboxShell>
    );
  }

  return (
    <MailboxShell tagline={t("insideTagline")}>
      <CorrespondenceList
        correspondences={mailbox.correspondences}
        onOpen={(id) => {
          setOpenCorrespondenceId(id);
          setPhase("reading");
        }}
      />
      <CloseMailboxLink label={t("close")} />
    </MailboxShell>
  );
}

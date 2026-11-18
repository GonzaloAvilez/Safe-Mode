"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MailboxLetter } from "@/lib/mailbox";
import type { LetterSender } from "@/lib/letter-lifecycle";
import { formatLetterAge } from "./format-letter-age";

// ADR-004 #213, design B4: one letter, on paper. What the paper says depends on the letter:
//   - delivered: the text, signed by who wrote it (never a name: "someone who saw themselves in
//     your phrase", or "whoever left the phrase");
//   - your own, waiting for review: postmarked "on its way", up to 48 hours (design B3);
//   - your own, rejected in review: postmarked "not delivered", and it doesn't use your turn (C3);
//   - its text erased after 60 days: blank lines, and what remains is that someone wrote (C4).

function Postmark({ label, faded = false }: { label: string; faded?: boolean }) {
  return (
    <span
      className={`absolute right-4 bottom-4 flex size-[74px] rotate-[-12deg] items-center justify-center rounded-full px-1 text-center text-[9px] leading-[1.25] font-semibold tracking-[1.2px] uppercase ${
        faded ? "border-[1.5px] border-[rgba(42,38,32,0.45)] text-[rgba(42,38,32,0.6)]" : "border-[1.5px] border-dashed border-[rgba(42,38,32,0.45)] text-[rgba(42,38,32,0.65)]"
      }`}
    >
      {label}
    </span>
  );
}

export function LetterPaper({
  letter,
  number,
  yourSide,
  now,
}: {
  letter: MailboxLetter;
  number: number;
  yourSide: LetterSender;
  now: Date;
}) {
  const t = useTranslations("mailbox.letter");
  const locale = useLocale();
  const yours = letter.sender === yourSide;
  const erased = letter.body === null;
  const rejected = letter.status === "rejected";
  const held = letter.status === "held";
  const signature = yours ? null : yourSide === "author" ? t("fromVisitor") : t("fromAuthor");

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <article
        data-letter-status={letter.status}
        className={`relative w-full rounded-[4px] px-6 pt-6 pb-6 ${
          erased
            ? "-rotate-[0.6deg] border border-[rgba(242,237,227,0.18)] bg-[rgba(242,237,227,0.1)] text-white/60"
            : rejected
              ? "rotate-[0.5deg] bg-[#d9d3c7] text-[rgba(42,38,32,0.6)] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
              : "-rotate-[0.6deg] bg-[#f2ede3] text-[#2a2620] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        }`}
      >
        <div
          className={`flex justify-between gap-4 text-[10px] tracking-[1.5px] uppercase ${
            erased ? "text-white/45" : "text-[rgba(42,38,32,0.55)]"
          }`}
        >
          <span>
            {t("number", { number })}
            {yours && ` · ${t("yours")}`}
          </span>
          <span>{formatLetterAge(letter.createdAt, now, locale)}</span>
        </div>

        {erased ? (
          <div aria-hidden="true" className="mt-6 flex flex-col gap-[18px]">
            <span className="border-t border-dashed border-[rgba(242,237,227,0.2)]" />
            <span className="border-t border-dashed border-[rgba(242,237,227,0.2)]" />
            <span className="border-t border-dashed border-[rgba(242,237,227,0.2)]" />
            <span className="w-3/5 border-t border-dashed border-[rgba(242,237,227,0.2)]" />
          </div>
        ) : (
          <p className={`mt-4 text-[15px] leading-[1.75] whitespace-pre-line ${held || rejected ? "pr-16" : ""}`}>
            {letter.body}
          </p>
        )}

        {signature && (
          <p className={`mt-4 text-right text-[12px] ${erased ? "text-white/45" : "text-[rgba(42,38,32,0.55)]"}`}>{signature}</p>
        )}

        {!erased && held && <Postmark label={t("held")} />}
        {!erased && rejected && <Postmark label={t("rejected")} faded />}
      </article>

      {erased ? (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-[15px] text-white">{t("erasedHeadline")}</p>
          <p className="text-[13px] leading-[1.6] text-white/60">{yours ? t("erasedYours") : t("erasedTheirs")}</p>
        </div>
      ) : rejected ? (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-[15px] text-white">{t("rejectedHeadline")}</p>
          <p className="text-[13px] leading-[1.6] text-white/60">{t("rejectedBody")}</p>
        </div>
      ) : held ? (
        <p className="text-center text-[13px] leading-[1.6] text-white/60">{t("heldNote")}</p>
      ) : null}
    </div>
  );
}

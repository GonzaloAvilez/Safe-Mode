"use client";

import { useTranslations } from "next-intl";
import type { MailboxCorrespondence, MailboxCorrespondenceState } from "@/lib/mailbox";

// The postmark for each state the server can give a correspondence (MailboxCorrespondenceState).
// `satisfies` makes a state added there a build error here until it has a postmark.
export const POSTMARKS = {
  your_turn: "postmark.your_turn",
  their_turn: "postmark.their_turn",
  awaiting_review: "postmark.awaiting_review",
  closed: "postmark.closed",
} as const satisfies Record<MailboxCorrespondenceState, string>;

// ADR-004 #213, design B3: each correspondence is an envelope. On its front, the phrase both sides
// share; on the postmark, whose turn it is. There's no "new letter" mark: reading isn't tracked
// (decided 2026-11-11), so the mailbox can't know what's been read.

function CorrespondenceEnvelope({
  correspondence,
  onOpen,
}: {
  correspondence: MailboxCorrespondence;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("mailbox.list");
  const closed = correspondence.state === "closed";
  const yourTurn = correspondence.state === "your_turn";

  return (
    <button
      type="button"
      onClick={() => onOpen(correspondence.id)}
      data-state={correspondence.state}
      className={`relative block w-full overflow-hidden rounded-md px-5 pt-12 pb-6 pr-24 text-left transition-transform duration-300 hover:-translate-y-0.5 ${
        closed ? "bg-[rgba(242,237,227,0.16)] text-white/75" : "bg-[#f2ede3] text-[#2a2620]"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 342 60" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[60px] w-full">
        <path
          d="M0 0 L171 44 L342 0"
          fill="none"
          stroke={closed ? "rgba(255,255,255,0.18)" : "rgba(42,38,32,0.22)"}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={`block text-[10px] tracking-[2px] uppercase ${closed ? "text-white/50" : "text-[rgba(42,38,32,0.55)]"}`}>
        {correspondence.yourSide === "author" ? t("aboutYourTrace") : t("toAPhrase")}
      </span>
      <span className="mt-1.5 block text-[15px] leading-[1.35]">“{correspondence.phraseText}”</span>
      <span
        className={`absolute top-10 right-4 flex size-[70px] rotate-[-10deg] items-center justify-center rounded-full px-1 text-center text-[9px] leading-[1.25] font-semibold tracking-[1.2px] uppercase ${
          yourTurn
            ? "border-[1.5px] border-[#b8862a] text-[#9a6d1c]"
            : closed
              ? "border border-white/30 text-white/55"
              : "border-[1.5px] border-dashed border-[rgba(42,38,32,0.45)] text-[rgba(42,38,32,0.65)]"
        }`}
      >
        {t(POSTMARKS[correspondence.state])}
      </span>
    </button>
  );
}

export function CorrespondenceList({
  correspondences,
  onOpen,
}: {
  correspondences: MailboxCorrespondence[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("mailbox.list");
  const anyOnItsWay = correspondences.some((correspondence) => correspondence.state === "awaiting_review");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-[22px] font-light tracking-[5px] text-white/82">{t("headline")}</h1>
      <ul className="flex w-full flex-col gap-4">
        {correspondences.map((correspondence) => (
          <li key={correspondence.id}>
            <CorrespondenceEnvelope correspondence={correspondence} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      <p className="max-w-[300px] text-center text-[11px] leading-[1.5] text-white/40">
        {anyOnItsWay && (
          <>
            {t("onItsWay")}
            <br />
          </>
        )}
        {t("kept")}
      </p>
    </div>
  );
}

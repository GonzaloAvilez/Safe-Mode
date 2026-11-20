"use client";

import { useLocale, useTranslations } from "next-intl";
import type { LetterContactKind } from "./send-letter";

// A letter that didn't leave, in words, wherever it was written (the mailbox, Mirror): what to
// change (contact details, moderation), or what's going on (letters paused, too many tries, no
// connection). The paper comes back with this line under it.
export type LetterNoticeOutcome =
  | { type: "rejected"; reason: "moderation" }
  | { type: "rejected"; reason: "contact_info"; contactKinds: LetterContactKind[] }
  | { type: "letters_closed" }
  | { type: "error"; reason: "too_many" | "failed" | "offline" };

// Whether an outcome gives the paper back with a line under it ("held" leaves, "crisis" shows help).
export function isLetterNoticeOutcome(outcome: { type: string }): outcome is LetterNoticeOutcome {
  return outcome.type === "rejected" || outcome.type === "letters_closed" || outcome.type === "error";
}

export function useLetterNotice(): (outcome: LetterNoticeOutcome) => string {
  const t = useTranslations("letterNotice");
  const tc = useTranslations("common");
  const locale = useLocale();

  return (outcome) => {
    switch (outcome.type) {
      case "rejected":
        if (outcome.reason === "moderation") return t("moderation");
        return `${t("contactFound", {
          things: new Intl.ListFormat(locale, { type: "conjunction" }).format(
            outcome.contactKinds.map((kind) => t(`contactKind.${kind}`))
          ),
        })} ${t("contactRemove", { count: outcome.contactKinds.length })}`;
      case "letters_closed":
        return t("lettersClosed");
      case "error":
        if (outcome.reason === "too_many") return t("tooMany");
        if (outcome.reason === "offline") return tc("errors.couldntConnect");
        return t("failed");
    }
  };
}

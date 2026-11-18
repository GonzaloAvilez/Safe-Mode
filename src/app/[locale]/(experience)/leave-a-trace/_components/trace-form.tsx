"use client";

import { useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { sendTrace } from "./send-trace";

const MAX_TEXT_LENGTH = 400;

type ErrorOutcome = { message: string } | null;

// The last step of the flow — optional, so it offers an explicit way out ("prefiero
// no dejar nada") rather than only a submit button. Reuses Write's own textarea/button
// spec per the 2026-07-12 mockup direction, just at 400 chars instead of 800 and
// without Searching: submitUserPhrase is a single insert (moderation runs after the
// response via next/server's after(), see /api/phrases), so there's no real wait to
// ritualize here.
//
// Doesn't render its own closing state — LeaveATracePage owns that (the rich
// Gratitude-style canvas + closing copy), so it just reports back which way this
// resolved.
//
// With letters open (ADR-004 #212) submitting doesn't send anything yet: it goes on to the choice
// ("choosing"), which sends the phrase once the person has answered whether they want letters.
// With letters closed it sends right here, exactly as before.
export function TraceForm({
  lettersOpen,
  onResolved,
}: {
  lettersOpen: boolean;
  onResolved: (phase: "submitted" | "skipped" | "choosing") => void;
}) {
  const t = useTranslations("leaveATrace");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { leaveATraceDraft: text, setLeaveATraceDraft: setText } = useRitualState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorOutcome>(null);
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot("leave-a-trace");

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (lettersOpen) {
      onResolved("choosing");
      return;
    }

    setSubmitting(true);
    lockLocaleSwitch();
    setError(null);

    const result = await sendTrace({
      text,
      acceptsLetters: false,
      honeypot,
      formRenderedAt,
      locale,
      messages: { somethingWrong: tc("errors.somethingWrong"), couldntConnect: tc("errors.couldntConnect") },
    });

    unlockLocaleSwitch();
    if (result.type === "error") {
      setError({ message: result.message });
      setSubmitting(false);
      return;
    }

    setText("");
    onResolved("submitted");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder={t("placeholder")}
        rows={4}
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />

      {error && (
        <p className="text-center text-[14px] leading-[1.6] tracking-[.3px] text-white/50">{error.message}</p>
      )}

      <div className="flex flex-col items-center gap-4">
        <button
          type="submit"
          disabled={submitting || text.trim().length === 0}
          className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[13px] tracking-[1px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
        >
          {submitting ? tc("saving") : t("submit")}
        </button>
        <button
          type="button"
          onClick={() => {
            setText("");
            onResolved("skipped");
          }}
          disabled={submitting}
          className="text-[13px] tracking-[.5px] text-white/25 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/45 disabled:pointer-events-none disabled:opacity-30"
        >
          {t("skip")}
        </button>
      </div>
    </form>
  );
}

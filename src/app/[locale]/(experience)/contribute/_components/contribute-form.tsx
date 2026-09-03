"use client";

import { useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { CONTRIBUTE_ORIGIN } from "@/lib/phrase-origin";
import { useContributionState } from "@/app/_components/experience-state/contribution";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";

const MAX_TEXT_LENGTH = 400;

type Status = { type: "error"; message: string } | { type: "saved" } | null;

// Standalone contribution form for workshop podmates seeding the corpus directly —
// unlike Leave a Trace (one phrase, the close of the full 9-screen flow), this expects
// several submissions in one sitting, so a successful submit clears the field and loops
// back to a blank form instead of resolving to a closing screen.
export function ContributeForm() {
  const t = useTranslations("contribute");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { draft: text, setDraft: setText, count, setCount, saved, setSaved } = useContributionState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const { honeypot, setHoneypot, formRenderedAt, restartHoneypot } = useHoneypot("contribute");

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    lockLocaleSwitch();
    setStatus(null);
    setSaved(false);

    try {
      const res = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          honeypot,
          formRenderedAt,
          origin: CONTRIBUTE_ORIGIN,
          locale,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setStatus({ type: "error", message: body.error ?? tc("errors.somethingWrong") });
        setSubmitting(false);
        unlockLocaleSwitch();
        return;
      }

      setText("");
      setCount((c) => c + 1);
      setStatus({ type: "saved" });
      setSaved(true);
      restartHoneypot();
      setSubmitting(false);
      unlockLocaleSwitch();
    } catch {
      setStatus({ type: "error", message: tc("errors.couldntConnect") });
      setSubmitting(false);
      unlockLocaleSwitch();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (status) setStatus(null);
          if (saved) setSaved(false);
        }}
        maxLength={MAX_TEXT_LENGTH}
        placeholder={t("placeholder")}
        rows={4}
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />

      {status?.type === "error" && (
        <p className="text-center text-[14px] leading-[1.6] tracking-[.3px] text-white/50">{status.message}</p>
      )}
      {(status?.type === "saved" || saved) && (
        <p className="text-center text-[14px] leading-[1.6] tracking-[.3px] text-[rgba(200,160,30,0.75)]">
          {t("saved")}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || text.trim().length === 0}
        className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[13px] tracking-[1px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
      >
        {submitting ? tc("saving") : t("submit")}
      </button>

      {count > 0 && (
        <p className="text-center text-[13px] tracking-[.3px] text-white/25">
          {t("countLabel", { count })}
        </p>
      )}
    </form>
  );
}

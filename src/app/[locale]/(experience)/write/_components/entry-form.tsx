"use client";

import { useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";
import { writeMirrorHandoff } from "../../_shared/mirror-handoff";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { Searching } from "./searching";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState, type WriteOutcome } from "@/app/_components/experience-state/ritual";

const MAX_TEXT_LENGTH = 800;

type EntryFormProps = {
  outcome: WriteOutcome | null;
  onOutcomeChange: (outcome: WriteOutcome | null) => void;
};

export function EntryForm({ outcome, onOutcomeChange }: EntryFormProps) {
  const t = useTranslations("write");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { writeDraft: text, setWriteDraft: setText } = useRitualState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [submitting, setSubmitting] = useState(false);
  const { honeypot, setHoneypot, formRenderedAt, restartHoneypot } = useHoneypot("write");

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    lockLocaleSwitch();

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, honeypot, formRenderedAt, locale }),
      });

      const body = await res.json();

      if (!res.ok) {
        onOutcomeChange({ type: "error", message: body.error ?? tc("errors.somethingWrong") });
        setSubmitting(false);
        unlockLocaleSwitch();
        return;
      }

      if (body.type === "matched") {
        writeMirrorHandoff({
          outcome: "matched",
          text: body.phrase.text,
          entryId: body.entryId,
          phraseId: body.phrase.id,
        });
        setText("");
        router.push("/mirror");
        // Leave submitting=true — Searching stays on screen through the route swap
        // instead of the form flashing back for a frame first.
        return;
      }

      if (body.type === "no_match") {
        // No phrase to mirror back, but the visitor still passes through Mirror
        // rather than dead-ending here — see MirrorPage's no_match rendering.
        writeMirrorHandoff({ outcome: "no_match", entryId: body.entryId });
        setText("");
        router.push("/mirror");
        return;
      }

      onOutcomeChange({ type: body.type });
      setSubmitting(false);
      unlockLocaleSwitch();
    } catch {
      onOutcomeChange({ type: "error", message: tc("errors.couldntConnect") });
      setSubmitting(false);
      unlockLocaleSwitch();
    }
  }

  function reset() {
    setText("");
    onOutcomeChange(null);
    restartHoneypot();
  }

  if (submitting) {
    return <Searching />;
  }

  if (outcome) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <OutcomeMessage outcome={outcome} />
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/20 px-6 py-2 text-[13px] tracking-[1px] text-white/50 transition-colors duration-300 hover:border-[rgba(200,160,30,0.5)] hover:text-white/75"
        >
          {t("writeAgain")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-5">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder={t("placeholder")}
        rows={7}
        required
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />
      <button
        type="submit"
        disabled={text.trim().length === 0}
        className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[13px] tracking-[1px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
      >
        {t("send")}
      </button>
    </form>
  );
}

function OutcomeMessage({ outcome }: { outcome: WriteOutcome }) {
  const t = useTranslations("write.outcome");

  switch (outcome.type) {
    case "crisis":
      return (
        <div className="flex flex-col gap-3 text-[16px] leading-[1.8] tracking-[.3px] text-white/55">
          <p>{t("crisisIntro")}</p>
          <a
            href={CRISIS_RESOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-white/75 underline decoration-white/30 underline-offset-4"
          >
            {CRISIS_RESOURCE_URL}
          </a>
        </div>
      );
    case "general_flagged":
      return (
        <p className="text-[16px] leading-[1.8] tracking-[.3px] text-white/55">
          {t("generalFlagged")}
        </p>
      );
    case "cap_reached":
      return (
        <p className="text-[16px] leading-[1.8] tracking-[.3px] text-white/55">
          {t("capReached")}
        </p>
      );
    case "error":
      return <p className="text-[16px] leading-[1.8] tracking-[.3px] text-white/55">{outcome.message}</p>;
  }
}

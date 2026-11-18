"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { sendTrace } from "./send-trace";

// ADR-004 #212: the choice to receive letters, as its own moment after the trace is written and
// before it leaves (design: option C, docs/design/return-key-ritual-option-c.png). The phrase is
// sent only here, once the person has answered, so it never leaves before they know what
// answering means. Never asks for anything else and never presumes: "Puede que nadie escriba, y
// también está bien" is the honest part of the question.
//
// "Así está bien" sends it as always. "Sí, quiero un sello" sends it with acceptsLetters and the
// server hands over the author's seal, once: it goes to memory for the card and nowhere else.
export function LettersChoiceStep() {
  const t = useTranslations("leaveATrace");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {
    leaveATraceDraft: text,
    setLeaveATraceDraft: setText,
    setLeaveATracePhase: setPhase,
    setLeaveATraceKey: setKey,
  } = useRitualState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot("leave-a-trace");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(acceptsLetters: boolean) {
    setSending(true);
    lockLocaleSwitch();
    setError(null);

    const result = await sendTrace({
      text,
      acceptsLetters,
      honeypot,
      formRenderedAt,
      locale,
      messages: { somethingWrong: tc("errors.somethingWrong"), couldntConnect: tc("errors.couldntConnect") },
    });

    unlockLocaleSwitch();
    if (result.type === "error") {
      setError(result.message);
      setSending(false);
      return;
    }

    setText("");
    if (result.type === "sent_with_key") {
      setKey({ returnKey: result.returnKey, sentence: result.sentence });
      setPhase("keeping");
    } else {
      setPhase("submitted");
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <HoneypotField value={honeypot} onChange={setHoneypot} />

      <figure className="m-0 flex flex-col items-center gap-2.5 text-center">
        <figcaption className="text-[11px] tracking-[3px] text-white/50">{t("choice.label")}</figcaption>
        <blockquote className="m-0 text-[18px] leading-[1.6] font-light text-white/70">“{text}”</blockquote>
      </figure>

      <div aria-hidden="true" className="h-px w-10 bg-[rgba(210,158,32,0.45)]" />

      <ScreenPrompt headline={t("choice.headline")} subcopy={t("choice.body")} />

      {error && <p className="text-center text-[14px] leading-[1.6] tracking-[.3px] text-white/50">{error}</p>}

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => send(true)}
          disabled={sending}
          className="self-center rounded-full border border-[rgba(210,158,32,0.6)] px-8 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          {sending ? tc("saving") : t("choice.yes")}
        </button>
        <button
          type="button"
          onClick={() => send(false)}
          disabled={sending}
          className="text-[13px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
        >
          {t("choice.no")}
        </button>
      </div>
    </div>
  );
}

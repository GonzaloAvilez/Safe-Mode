"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { isAskedGroupCorrect, pickAskedGroup, type SealGroupIndex } from "@/lib/return-key-groups";
import { ScreenPrompt } from "../screen-prompt";
import { confirmReturnKey } from "./confirm-return-key";

// ADR-004 #212: "enciende la luz que falta" (design: option C, C3b). The card is gone; its three
// lights remain, one of them off. Typing that group of the seal lights it, and with that the seal
// is confirmed (#245): only a confirmed seal can receive letters (the author's) or send them (the
// visitor's). Which group is asked is random, so only someone who kept the whole seal somewhere
// can answer, and after looking at the seal again the next question is a different group.
//
// A wrong group is never punished: the person can look at the seal again, or leave. What the hint
// and the way out say, and what happens once the seal is confirmed, belong to the screen.

const GROUP_KEYS = ["first", "middle", "last"] as const;

// How long the third light stays lit before moving on, even if the server answers sooner.
export const LIT_LIGHT_HOLD_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ConfirmReturnKeyStepProps = {
  returnKey: string;
  // The group asked last time, so looking at the seal again never brings the same question.
  previouslyAsked: SealGroupIndex | null;
  // What the three lights do, in this screen's words.
  hint: string;
  // What failed, in this screen's words, when the server couldn't confirm the seal.
  failedMessage: string;
  // The way out without the seal ("Mejor sin cartas", "Volver a su frase").
  leaveLabel: string;
  // The seal is confirmed and the light has stayed on for a moment.
  onConfirmed: () => void;
  // Back to the card; `asked` is the group this step asked for.
  onSeeSealAgain: (asked: SealGroupIndex) => void;
  onLeave: () => void;
};

export function ConfirmReturnKeyStep({
  returnKey,
  previouslyAsked,
  hint,
  failedMessage,
  leaveLabel,
  onConfirmed,
  onSeeSealAgain,
  onLeave,
}: ConfirmReturnKeyStepProps) {
  const t = useTranslations("returnKey");
  const tc = useTranslations("common");
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [asked] = useState<SealGroupIndex>(() => pickAskedGroup(previouslyAsked));
  const [typed, setTyped] = useState("");
  const [lighting, setLighting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm(event: SubmitEvent) {
    event.preventDefault();
    if (lighting) return;
    if (!isAskedGroupCorrect(returnKey, asked, typed)) {
      setMessage(t("confirm.wrong"));
      return;
    }

    setLighting(true);
    setMessage(t("confirm.lit"));
    lockLocaleSwitch();
    const [result] = await Promise.all([confirmReturnKey(returnKey), wait(LIT_LIGHT_HOLD_MS)]);
    unlockLocaleSwitch();

    if (result.type === "confirmed") {
      onConfirmed();
      return;
    }

    setLighting(false);
    setMessage(
      result.reason === "too_many"
        ? t("confirm.tooMany")
        : result.reason === "offline"
          ? tc("errors.couldntConnect")
          : failedMessage
    );
  }

  const groupKey = GROUP_KEYS[asked];

  return (
    <form onSubmit={confirm} className="flex w-full max-w-md flex-col items-center gap-8">
      <div aria-hidden="true" className="relative flex h-[120px] items-center gap-16">
        <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-[rgba(240,192,96,0.18)]" />
        {[0, 1, 2].map((index) => {
          const on = index !== asked || lighting;
          return (
            <span
              key={index}
              data-light={on ? "on" : "off"}
              className={`relative size-[18px] rounded-full transition-all duration-700 ${
                on
                  ? "bg-[#f0c060] shadow-[0_0_30px_9px_rgba(240,192,96,0.42)]"
                  : "border-[1.5px] border-[rgba(240,192,96,0.8)] bg-[#0b0b0c]"
              }`}
            />
          );
        })}
      </div>

      <ScreenPrompt headline={t("confirm.headline")} subcopy={t(`confirm.ask.${groupKey}`)} />

      <label className="flex flex-col items-center gap-2">
        <span className="text-[12px] tracking-[.4px] text-white/55">{t(`confirm.field.${groupKey}`)}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value.replace(/\D/g, "").slice(0, 5));
            if (!lighting) setMessage(null);
          }}
          disabled={lighting}
          placeholder="00000"
          className="w-[210px] border-b border-[rgba(210,158,32,0.6)] bg-transparent py-2 text-center font-mono text-[26px] tracking-[10px] text-white/90 outline-none placeholder:text-white/20 focus:border-[#e4b34c] disabled:opacity-60"
        />
      </label>

      <p role="status" className="min-h-[1.6em] text-center text-[13px] leading-[1.6] text-white/60">
        {message}
      </p>

      <div className="flex flex-col items-center gap-3">
        <button
          type="submit"
          disabled={lighting || typed.length !== 5}
          className="rounded-full border border-[rgba(210,158,32,0.6)] px-10 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          {t("confirm.submit")}
        </button>
        <button
          type="button"
          onClick={() => onSeeSealAgain(asked)}
          disabled={lighting}
          className="text-[13px] tracking-[.5px] text-white/55 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
        >
          {t("confirm.back")}
        </button>
        <span className="text-[12px] leading-[1.6] text-white/45">{hint}</span>
        <button
          type="button"
          onClick={onLeave}
          disabled={lighting}
          className="mt-1 text-[12px] tracking-[.5px] text-white/35 underline decoration-white/10 underline-offset-4 transition-colors duration-300 hover:text-white/60 disabled:pointer-events-none disabled:opacity-30"
        >
          {leaveLabel}
        </button>
      </div>
    </form>
  );
}

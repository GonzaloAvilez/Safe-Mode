"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { isAskedGroupCorrect, pickAskedGroup, type SealGroupIndex } from "@/lib/return-key-groups";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { confirmReturnKey } from "./confirm-return-key";

// ADR-004 #212: sealing the trace (design: option C, C3b, "enciende la luz que falta"). The card is
// gone; its three lights remain, one of them off. Typing that group of the seal lights it, and
// with that the seal is confirmed (#245): from then on the phrase accepts letters. Which group is
// asked is random, so only someone who kept the whole seal somewhere can answer, and after
// looking at the seal again the next question is a different group.
//
// Lighting the last light is what closes the ritual: the light stays on for a moment and the
// closing follows, so the required steps end in the closing instead of standing before it.
// A wrong group is never punished: the person can look at the seal again, or leave without letters.

const GROUP_KEYS = ["first", "middle", "last"] as const;

// How long the third light stays lit before the closing, even if the server answers sooner.
export const LIT_LIGHT_HOLD_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SealTraceStep() {
  const t = useTranslations("leaveATrace");
  const tc = useTranslations("common");
  const {
    leaveATraceKey: key,
    setLeaveATraceKey: setKey,
    leaveATracePhase: phase,
    setLeaveATracePhase: setPhase,
    leaveATraceLastAsked: lastAsked,
    setLeaveATraceLastAsked: setLastAsked,
  } = useRitualState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [asked] = useState<SealGroupIndex>(() => pickAskedGroup(lastAsked));
  const [typed, setTyped] = useState("");
  const [lighting, setLighting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A seal that isn't in memory (the ritual was reset) can't be sealed. Only while still on this
  // step: sealing lets go of the seal as it moves on, and that must not turn "sealed" into "submitted".
  useEffect(() => {
    if (!key && phase === "sealing") setPhase("submitted");
  }, [key, phase, setPhase]);
  if (!key) return null;
  const returnKey = key.returnKey;

  async function seal(event: SubmitEvent) {
    event.preventDefault();
    if (lighting) return;
    if (!isAskedGroupCorrect(returnKey, asked, typed)) {
      setMessage(t("seal.wrong"));
      return;
    }

    setLighting(true);
    setMessage(t("seal.lit"));
    lockLocaleSwitch();
    const [result] = await Promise.all([confirmReturnKey(returnKey), wait(LIT_LIGHT_HOLD_MS)]);
    unlockLocaleSwitch();

    if (result.type === "confirmed") {
      // The seal leaves memory as the ritual closes: from here only whoever kept it has it.
      setKey(null);
      setLastAsked(null);
      setPhase("sealed");
      return;
    }

    setLighting(false);
    setMessage(
      result.reason === "too_many"
        ? t("seal.tooMany")
        : result.reason === "offline"
          ? tc("errors.couldntConnect")
          : t("seal.failed")
    );
  }

  function seeSealAgain() {
    setLastAsked(asked);
    setPhase("keeping");
  }

  function leaveWithoutLetters() {
    setKey(null);
    setLastAsked(null);
    setPhase("submitted");
  }

  const groupKey = GROUP_KEYS[asked];

  return (
    <form onSubmit={seal} className="flex w-full max-w-md flex-col items-center gap-8">
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

      <ScreenPrompt headline={t("seal.headline")} subcopy={t(`seal.ask.${groupKey}`)} />

      <label className="flex flex-col items-center gap-2">
        <span className="text-[12px] tracking-[.4px] text-white/55">{t(`seal.field.${groupKey}`)}</span>
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
          {t("seal.submit")}
        </button>
        <button
          type="button"
          onClick={seeSealAgain}
          disabled={lighting}
          className="text-[13px] tracking-[.5px] text-white/55 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
        >
          {t("seal.back")}
        </button>
        <span className="text-[12px] leading-[1.6] text-white/45">{t("seal.hint")}</span>
        <button
          type="button"
          onClick={leaveWithoutLetters}
          disabled={lighting}
          className="mt-1 text-[12px] tracking-[.5px] text-white/35 underline decoration-white/10 underline-offset-4 transition-colors duration-300 hover:text-white/60 disabled:pointer-events-none disabled:opacity-30"
        >
          {t("keep.withoutLetters")}
        </button>
      </div>
    </form>
  );
}

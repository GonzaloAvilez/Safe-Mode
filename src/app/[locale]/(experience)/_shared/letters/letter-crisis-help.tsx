"use client";

import { useTranslations } from "next-intl";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";

// ADR-004 #213, design C6: when the safety pipeline reads a crisis in a letter, the letter doesn't
// leave and the person gets help instead, wherever they were writing: the mailbox, or Mirror (#212).
// The way back is the screen's own ("Volver a mis sobres", "Volver a su frase").
export function LetterCrisisHelp({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  const t = useTranslations("letterCrisis");
  const [first, second] = t("headline").split("\n");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <div aria-hidden="true" className="relative mb-3 flex size-24 items-center justify-center">
        <span className="absolute size-24 rounded-full border border-[rgba(242,192,99,0.22)] bg-[rgba(242,192,99,0.06)]" />
        <span className="size-4 rounded-full bg-[#f2c063] shadow-[0_0_24px_8px_rgba(242,192,99,0.32)]" />
      </div>
      <h1 className="text-[22px] leading-[1.4] font-light tracking-[3px] text-white/90">
        {first}
        <br />
        {second}
      </h1>
      <p className="text-[14px] leading-[1.65] text-white/70">{t("intro")}</p>
      <a
        href={CRISIS_RESOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[15px] text-[rgba(242,192,99,0.9)] underline underline-offset-4"
      >
        {CRISIS_RESOURCE_URL.replace(/^https:\/\//, "")}
      </a>
      <p className="mt-3 text-[12px] leading-[1.6] text-white/45">{t("notSent")}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 text-[12px] tracking-[.5px] text-white/50 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80"
      >
        {backLabel}
      </button>
    </div>
  );
}

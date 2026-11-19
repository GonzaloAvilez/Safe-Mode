"use client";

import { useTranslations } from "next-intl";

// ADR-004 #213, design B5: the paper a letter is written on, cream and ruled, wherever a letter is
// written: the next one in the mailbox, and the first one from Mirror. It only holds the text; what
// sending it does belongs to the screen.

// The longest letter the server accepts (LETTER_MAX_LENGTH in src/lib/letters.ts, which is
// server-only; a test keeps the two equal).
export const LETTER_MAX_CHARACTERS = 1200;

type LetterDraftPaperProps = {
  // Which letter of the correspondence this one will be, counting from 1 ("Carta 1 · La tuya").
  letterNumber: number;
  value: string;
  onChange: (text: string) => void;
  // The element that says what happened to the last try (rejected, paused...), read with the field.
  noticeId: string;
};

export function LetterDraftPaper({ letterNumber, value, onChange, noticeId }: LetterDraftPaperProps) {
  const t = useTranslations("letterPaper");

  return (
    <label className="block w-full -rotate-[0.4deg] rounded-[4px] bg-[#f2ede3] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,rgba(42,38,32,0.08)_27px,rgba(42,38,32,0.08)_28px)] px-5 pt-5 pb-3 text-[#2a2620] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
      <span aria-hidden="true" className="block text-[10px] tracking-[1.5px] text-[rgba(42,38,32,0.55)] uppercase">
        {t("label", { number: letterNumber })}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={LETTER_MAX_CHARACTERS}
        placeholder={t("placeholder")}
        aria-label={t("fieldLabel")}
        aria-describedby={noticeId}
        className="mt-2.5 block h-[280px] w-full resize-none bg-transparent p-0 text-[15px] leading-[28px] text-[#2a2620] outline-none placeholder:text-[rgba(42,38,32,0.4)]"
      />
      <span className="mt-2 flex justify-between text-[10px] text-[rgba(42,38,32,0.5)]">
        <span>{t("noContact")}</span>
        <span className="font-mono">
          {value.length} / {LETTER_MAX_CHARACTERS}
        </span>
      </span>
    </label>
  );
}

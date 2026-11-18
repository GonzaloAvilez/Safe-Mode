"use client";

import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useMailboxState } from "@/app/_components/experience-state/mailbox";
import { parseSeal } from "@/lib/return-key-groups";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { openMailbox } from "./open-mailbox";
import { readSealFromImage } from "./read-seal-from-image";

// ADR-004 #213, design B2: the mailbox opens with the seal. First the picture of it, the one
// "Guardar imagen" saved (its QR is read here, on the phone, and the picture goes nowhere), and
// below it the numbers, typed by hand. Either way, only a whole seal is ever sent.
//
// A seal that opens nothing gets one plain sentence (design C1), the same whether it was mistyped
// or never existed: nothing that would help someone guess.

type Message = { text: string; hint?: string };

export function ShowSealStep() {
  const t = useTranslations("mailbox.show");
  const tc = useTranslations("common");
  const tCard = useTranslations("returnKeyCard");
  const { setMailboxReturnKey, setMailbox, setMailboxPhase } = useMailboxState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"reading" | "opening" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [imageUnread, setImageUnread] = useState(false);

  async function open(returnKey: string) {
    setBusy("opening");
    setMessage(null);
    lockLocaleSwitch();
    const result = await openMailbox(returnKey);
    unlockLocaleSwitch();

    if (result.type === "opened") {
      setMailboxReturnKey(returnKey);
      setMailbox(result.mailbox);
      setMailboxPhase("correspondences");
      return;
    }

    setBusy(null);
    if (result.type === "not_recognized") {
      setMessage({ text: t("notRecognized"), hint: t("notRecognizedHint") });
    } else if (result.reason === "too_many") {
      setMessage({ text: t("tooMany") });
    } else if (result.reason === "offline") {
      setMessage({ text: tc("errors.couldntConnect") });
    } else {
      setMessage({ text: t("failed") });
    }
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same picture again is noticed too.
    event.target.value = "";
    if (!file || busy) return;

    setBusy("reading");
    setMessage(null);
    const seal = await readSealFromImage(file);
    if (!seal) {
      setBusy(null);
      setImageUnread(true);
      setMessage({ text: t("noSealInImage"), hint: t("noSealInImageHint") });
      return;
    }
    setImageUnread(false);
    await open(seal);
  }

  async function openTyped(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const seal = parseSeal(typed);
    if (!seal) {
      setMessage({ text: t("incomplete") });
      return;
    }
    await open(seal);
  }

  return (
    <form onSubmit={openTyped} className="flex w-full max-w-sm flex-col items-center gap-6">
      <ScreenPrompt headline={t("headline")} subcopy={t("subcopy")} />

      <label
        className={`flex h-[210px] w-[170px] cursor-pointer flex-col items-center justify-center gap-3.5 rounded-md border-2 border-dashed border-[rgba(242,237,227,0.35)] bg-[rgba(242,237,227,0.04)] px-4 text-center text-[13px] leading-[1.4] text-[rgba(242,237,227,0.85)] transition-colors duration-300 hover:border-[rgba(242,237,227,0.6)] has-[:focus-visible]:border-[rgba(242,237,227,0.8)] ${
          busy ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        {imageUnread ? t("chooseAnother") : t("chooseImage")}
        <span aria-hidden="true" className="text-[10px] tracking-[2px] text-[rgba(224,169,58,0.8)]">
          {tCard("stamp")}
        </span>
        {/* Named on its own: the label also holds the stamp's decoration, which isn't part of the action. */}
        <input
          type="file"
          accept="image/*"
          aria-label={imageUnread ? t("chooseAnother") : t("chooseImage")}
          onChange={chooseImage}
          disabled={busy !== null}
          className="sr-only"
        />
      </label>
      <p className="-mt-2 max-w-[260px] text-center text-[11px] leading-[1.5] text-white/40">{t("imagePrivacy")}</p>

      <div className="flex w-full items-center gap-3 text-[11px] text-white/35">
        <span className="flex-1 border-t border-white/10" />
        {t("orType")}
        <span className="flex-1 border-t border-white/10" />
      </div>

      <label className="w-full">
        <span className="sr-only">{t("fieldLabel")}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setMessage(null);
          }}
          disabled={busy !== null}
          placeholder="00000 · 00000 · 00000"
          className="w-full border-b border-white/25 bg-transparent py-2 text-center font-mono text-[clamp(15px,4.6vw,19px)] tracking-[1px] text-[#f2c063] outline-none placeholder:text-white/20 focus:border-[#e4b34c] disabled:opacity-60"
        />
      </label>

      <p role="status" className="min-h-[3.2em] text-center text-[13px] leading-[1.55] text-white/75">
        {busy ? t(busy) : message?.text}
        {!busy && message?.hint && (
          <>
            <br />
            <span className="text-white/50">{message.hint}</span>
          </>
        )}
      </p>

      <button
        type="submit"
        disabled={busy !== null || typed.trim() === ""}
        className="rounded-full border border-[rgba(210,158,32,0.6)] px-10 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        {t("submit")}
      </button>
    </form>
  );
}

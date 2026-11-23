"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { drawReturnKeyCardImage } from "@/lib/return-key-card";
import { confirmReturnKey } from "./confirm-return-key";
import { downloadBlob, isIosDevice } from "./download-blob";
import { readSealFromImage } from "./read-seal-from-image";
import { ReturnKeyCard, readCardFonts } from "./return-key-card";

// ADR-004 #212: where whoever is about to receive letters keeps their seal (design: option C, C2):
// the author leaving a trace, and the visitor about to write from Mirror. The card is private
// (nothing on it can be shared) and the seal is shown only here: the server keeps only its hash,
// so a lost seal can't be recovered by anyone, the founder included.
//
// Keeping the seal also confirms it (#245: only a confirmed seal receives or sends letters), in one
// gesture on this same screen: save the picture, then choose it. Its QR is read here, on the
// phone, and it must be this seal. That proves the picture landed somewhere the person can find
// it again, which is exactly what opening the mailbox will ask of them.
//
// The seal's digits are never shown (decided 2026-11-23), so nobody is asked to read, copy or
// type them: the old "missing light" step did, and it was tiring for exactly the people Refugio
// is for. The picture is the seal.
//
// A way out is always there; what it says and where it goes belongs to the screen showing the step.

// How long "your seal is kept" stays before moving on, even if the server answers sooner.
export const KEPT_MESSAGE_HOLD_MS = 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type KeepReturnKeyStepProps = {
  returnKey: string;
  sentence: string;
  // What keeping the seal is for, in this screen's words.
  body: string;
  // What failed, in this screen's words, when the server couldn't confirm the seal.
  failedMessage: string;
  // The way out without the seal ("Mejor sin cartas", "Volver a su frase").
  leaveLabel: string;
  // The seal is confirmed and "your seal is kept" has stayed a moment.
  onConfirmed: () => void;
  onLeave: () => void;
};

type Message = { text: string; hint?: string };

export function KeepReturnKeyStep({ returnKey, sentence, body, failedMessage, leaveLabel, onConfirmed, onLeave }: KeepReturnKeyStepProps) {
  const t = useTranslations("returnKey");
  const tc = useTranslations("returnKeyCard");
  const tm = useTranslations("mailbox.show");
  const tcommon = useTranslations("common");
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"checking" | "confirmed" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [imageUnread, setImageUnread] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function saveImage() {
    if (!cardRef.current) return;
    setSaving(true);
    setMessage(null);
    try {
      const picture = await drawReturnKeyCardImage({
        returnKey,
        sentence,
        labels: { brand: tc("brand"), stamp: tc("stamp"), footer: tc("footer") },
        fonts: readCardFonts(cardRef.current),
      });
      downloadBlob(picture, t("keep.fileName"));
      setSaved(true);
      setImageUnread(false);
      setIosHint(isIosDevice());
    } catch {
      setMessage({ text: t("keep.imageError") });
    } finally {
      setSaving(false);
    }
  }

  // Holds the language switch for the whole check, so changing language never interrupts it. A
  // step that's gone by the time an answer arrives (the ritual moved on) does nothing with it.
  async function whileChecking(operation: () => Promise<void>) {
    setBusy("checking");
    setMessage(null);
    lockLocaleSwitch();
    try {
      await operation();
    } finally {
      unlockLocaleSwitch();
      if (mounted.current) setBusy((current) => (current === "checking" ? null : current));
    }
  }

  async function confirm() {
    const result = await confirmReturnKey(returnKey);
    if (result.type === "confirmed") {
      setBusy("confirmed");
      await wait(KEPT_MESSAGE_HOLD_MS);
      if (mounted.current) onConfirmed();
      return;
    }
    setMessage({
      text:
        result.reason === "too_many"
          ? t("keep.tooMany")
          : result.reason === "offline"
            ? tcommon("errors.couldntConnect")
            : failedMessage,
    });
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same picture again is noticed too.
    event.target.value = "";
    if (!file || busy) return;

    await whileChecking(async () => {
      const seal = await readSealFromImage(file);
      if (!mounted.current) return;
      if (seal !== returnKey) {
        setImageUnread(true);
        setMessage(
          seal === null
            ? { text: tm("noSealInImage"), hint: tm("noSealInImageHint") }
            : { text: t("keep.otherSeal") }
        );
        return;
      }
      await confirm();
    });
  }

  const working = busy !== null;
  const status = busy === "checking" ? t("keep.checking") : busy === "confirmed" ? t("keep.confirmed") : message?.text;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <div className="relative h-[450px] w-[320px] max-[359px]:h-[383px] max-[359px]:w-[272px]">
        <div className="origin-top-left max-[359px]:scale-[0.85]">
          <ReturnKeyCard ref={cardRef} returnKey={returnKey} sentence={sentence} />
        </div>
      </div>

      <p className="max-w-[316px] text-center text-[13px] leading-[1.7] text-white/60">{body}</p>

      <div className="flex flex-col items-center gap-3">
        {saved ? (
          <>
            <div className="flex max-w-[316px] flex-col items-center gap-1 text-center text-[12px] leading-[1.6] text-white/55">
              <span>{t("keep.saved")}</span>
              {iosHint && <span>{t("keep.iosHint")}</span>}
            </div>
            {/* The picture just saved, chosen back: the gesture that keeps the seal. */}
            <label
              className={`mt-1 cursor-pointer rounded-full border text-center border-[rgba(210,158,32,0.6)] px-8 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-[rgba(242,192,99,0.8)] ${
                working ? "pointer-events-none opacity-30" : ""
              }`}
            >
              {imageUnread ? t("keep.chooseAnother") : t("keep.chooseImage")}
              <input type="file" accept="image/*" onChange={chooseImage} disabled={working} className="sr-only" />
            </label>
            <p className="max-w-[260px] text-center text-[11px] leading-[1.5] text-white/40">{tm("imagePrivacy")}</p>
            <button
              type="button"
              onClick={saveImage}
              disabled={saving || working}
              className="text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75 disabled:pointer-events-none disabled:opacity-30"
            >
              {t("keep.saveAgain")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={saveImage}
            disabled={saving || working}
            className="rounded-full border border-[rgba(210,158,32,0.6)] px-8 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            {t("keep.save")}
          </button>
        )}

        <p role="status" className="min-h-[1.6em] max-w-[316px] text-center text-[13px] leading-[1.6] text-white/70">
          {status}
          {!busy && message?.hint && (
            <>
              <br />
              <span className="text-white/50">{message.hint}</span>
            </>
          )}
        </p>

        <button
          type="button"
          onClick={onLeave}
          disabled={working}
          className="mt-1 text-[12px] tracking-[.5px] text-white/35 underline decoration-white/10 underline-offset-4 transition-colors duration-300 hover:text-white/60 disabled:pointer-events-none disabled:opacity-30"
        >
          {leaveLabel}
        </button>
      </div>
    </div>
  );
}

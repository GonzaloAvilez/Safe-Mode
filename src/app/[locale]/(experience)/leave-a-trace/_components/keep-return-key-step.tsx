"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRitualState } from "@/app/_components/experience-state/ritual";
import { drawReturnKeyCardImage } from "@/lib/return-key-card";
import { splitReturnKeyGroups } from "@/lib/return-key-groups";
import { downloadBlob, isIosDevice } from "./download-blob";
import { ReturnKeyCard, readCardFonts } from "./return-key-card";

// ADR-004 #212: where someone who chose letters keeps their seal (design: option C, C2). The card
// is private (nothing on it can be shared) and the seal is shown only here, once: the server keeps
// only its hash, so a lost seal can't be recovered by anyone, the founder included.
//
// Going on requires a gesture, because the seal can't be recovered. The page can require the
// action but can't know the picture really landed in the gallery or a note really got written, so
// this is care, not a lock: they save the image, or say they wrote it down. "Mejor sin cartas"
// is always there: the trace is already left, it just never receives letters.
export function KeepReturnKeyStep() {
  const t = useTranslations("leaveATrace");
  const tc = useTranslations("returnKeyCard");
  const { leaveATraceKey: key, setLeaveATraceKey: setKey, setLeaveATracePhase: setPhase } = useRitualState();
  const cardRef = useRef<HTMLDivElement>(null);
  const [kept, setKept] = useState<"none" | "image" | "hand">("none");
  const [wroteItAll, setWroteItAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iosHint, setIosHint] = useState(false);

  // A seal that isn't in memory (the ritual was reset) can't be shown: nothing left to keep.
  useEffect(() => {
    if (!key) setPhase("submitted");
  }, [key, setPhase]);
  if (!key) return null;

  const canContinue = kept === "image" || (kept === "hand" && wroteItAll);

  async function saveImage() {
    if (!key || !cardRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const picture = await drawReturnKeyCardImage({
        returnKey: key.returnKey,
        sentence: key.sentence,
        labels: { brand: tc("brand"), stamp: tc("stamp"), footer: tc("footer") },
        fonts: readCardFonts(cardRef.current),
      });
      downloadBlob(picture, t("keep.fileName"));
      setKept("image");
      setIosHint(isIosDevice());
    } catch {
      setError(t("keep.imageError"));
    } finally {
      setSaving(false);
    }
  }

  // The seal leaves memory as the step ends: from here only whoever kept it has it.
  function finish() {
    setKey(null);
    setPhase("submitted");
  }

  const groups = splitReturnKeyGroups(key.returnKey);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <div aria-hidden="true" className="flex items-end gap-12">
        {groups.map((group) => (
          <div key={group} className="flex flex-col items-center gap-2.5">
            <span className="size-[9px] rounded-full bg-[#f0c060] shadow-[0_0_18px_5px_rgba(240,192,96,0.4)]" />
            <span className="font-mono text-[12px] tracking-[1.5px] text-white/60">{group}</span>
          </div>
        ))}
      </div>

      <div className="relative h-[450px] w-[320px] max-[359px]:h-[383px] max-[359px]:w-[272px]">
        <div className="origin-top-left max-[359px]:scale-[0.85]">
          <ReturnKeyCard ref={cardRef} returnKey={key.returnKey} sentence={key.sentence} />
        </div>
      </div>

      <p className="max-w-[316px] text-center text-[13px] leading-[1.7] text-white/60">{t("keep.body")}</p>

      {error && <p className="text-center text-[13px] leading-[1.6] text-white/60">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={saveImage}
          disabled={saving}
          className="rounded-full border border-[rgba(210,158,32,0.6)] px-8 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          {t("keep.save")}
        </button>

        {kept === "image" && (
          <div className="flex max-w-[316px] flex-col items-center gap-1 text-center text-[12px] leading-[1.6] text-white/55">
            <span role="status">{t("keep.saved")}</span>
            {iosHint && <span>{t("keep.iosHint")}</span>}
          </div>
        )}

        {kept !== "image" &&
          (kept === "hand" ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-white/70">
              <input
                type="checkbox"
                checked={wroteItAll}
                onChange={(event) => setWroteItAll(event.target.checked)}
                className="size-4 accent-[#d29e20]"
              />
              {t("keep.wroteConfirm")}
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setKept("hand")}
              className="text-[13px] tracking-[.5px] text-white/55 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80"
            >
              {t("keep.wroteByHand")}
            </button>
          ))}

        {canContinue && (
          <button
            type="button"
            onClick={finish}
            className="mt-2 rounded-full border border-white/25 px-8 py-2.5 text-[13px] tracking-[1px] text-white/80 transition-colors duration-300 hover:border-[rgba(210,158,32,0.6)] hover:text-white"
          >
            {t("keep.continue")}
          </button>
        )}

        <button
          type="button"
          onClick={finish}
          className="mt-1 text-[12px] tracking-[.5px] text-white/35 underline decoration-white/10 underline-offset-4 transition-colors duration-300 hover:text-white/60"
        >
          {t("keep.withoutLetters")}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AmbientGlowBackground } from "../_shared/ambient-glow-background";
import { SCENE_BG_CLASS } from "../_shared/scene";

const LAST_BEAT = 2;

// A short narrative threshold for a true cold arrival: promise, mechanism, evidence.
// Every beat advances only when the visitor chooses. Reading should never feel like
// racing a timer in a product whose purpose is to make room and lower pressure.
export function ArrivalIntro({ onDone, phrase }: { onDone: () => void; phrase: ReactNode }) {
  const t = useTranslations("arrivalIntro");
  const tc = useTranslations("common");
  const [beat, setBeat] = useState(0);
  const steps = t.raw("steps") as Array<{ title: string; detail: string }>;

  function advance() {
    if (beat === LAST_BEAT) {
      onDone();
      return;
    }
    setBeat((current) => current + 1);
  }

  return (
    <div className={`fixed inset-0 z-30 flex flex-col overflow-y-auto ${SCENE_BG_CLASS}`}>
      <AmbientGlowBackground />

      <header className="relative z-20 flex items-center gap-4 px-7 pt-24 sm:px-10">
        <div className="flex flex-1 gap-2" aria-label={t("progress", { step: beat + 1, total: 3 })}>
          {[0, 1, 2].map((step) => (
            <div key={step} className="h-px flex-1 overflow-hidden bg-white/10">
              <div
                className={`h-full bg-[rgba(200,160,30,0.7)] transition-transform duration-700 ${step <= beat ? "scale-x-100" : "scale-x-0"}`}
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={onDone} className="text-[11px] tracking-[0.14em] text-white/35 uppercase transition-colors hover:text-white/65 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[rgba(200,160,30,0.8)]">
          {t("skip")}
        </button>
      </header>

      <main className="relative z-10 m-auto flex min-h-[520px] w-full max-w-[560px] flex-col items-center justify-center px-7 py-10 text-center">
        <section key={beat} className="arrival-intro-reveal flex w-full flex-col items-center">
          {beat === 0 && (
            <>
              <div className="relative mb-10 h-24 w-24">
                <div className="absolute inset-0 rounded-full bg-[rgba(200,160,30,0.08)] blur-xl" />
                <div className="absolute inset-[38px] rounded-full bg-[rgba(248,225,150,0.95)] shadow-[0_0_28px_rgba(200,160,30,0.75)]" />
              </div>
              <p className="text-[11px] tracking-[0.18em] text-[rgba(200,160,30,0.75)] uppercase">{t("welcomeEyebrow")}</p>
              <h1 className="mt-5 whitespace-pre-line text-[clamp(25px,7vw,36px)] leading-[1.3] font-light tracking-[0.07em] text-white/85">
                {t("welcomeHeadline")}
              </h1>
              <p className="mt-6 max-w-[360px] text-[15px] leading-[1.75] text-white/45">
                {t("welcomeBody")}
              </p>
            </>
          )}

          {beat === 1 && (
            <>
              <p className="text-[11px] tracking-[0.18em] text-[rgba(200,160,30,0.75)] uppercase">{t("howEyebrow")}</p>
              <h1 className="mt-5 whitespace-pre-line text-[clamp(24px,6vw,32px)] leading-[1.3] font-light tracking-[0.05em] text-white/85">
                {t("howHeadline")}
              </h1>
              <div className="mt-10 grid w-full max-w-[480px] grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-3 text-center">
                {steps.map(({ title, detail }, index) => (
                  <div key={title} className="contents">
                    <div>
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(200,160,30,0.3)] text-[11px] text-[rgba(200,160,30,0.8)]">{String(index + 1).padStart(2, "0")}</div>
                      <p className="mt-3 text-[13px] tracking-[.06em] text-white/65">{title}</p>
                      <p className="mt-1 text-[11px] leading-[1.4] text-white/30">{detail}</p>
                    </div>
                    {index < 2 && <div className="mt-[21px] h-px w-5 bg-gradient-to-r from-white/10 to-[rgba(200,160,30,0.45)]" />}
                  </div>
                ))}
              </div>
              <p className="mt-9 max-w-[410px] text-[13px] leading-[1.7] text-white/35">
                {t("privacy")}
              </p>
            </>
          )}

          {beat === 2 && (
            <>
              <p className="text-[11px] tracking-[0.18em] text-[rgba(200,160,30,0.75)] uppercase">{t("presenceEyebrow")}</p>
              <h1 className="mt-5 text-[clamp(24px,6vw,32px)] leading-[1.3] font-light tracking-[0.06em] text-white/85">{t("presenceHeadline")}</h1>
              <figure className="mt-9 w-full max-w-[460px] rounded-2xl border border-[rgba(200,160,30,0.22)] bg-[rgba(18,15,11,0.68)] px-7 py-6 text-left shadow-[0_0_52px_-16px_rgba(200,160,30,0.4)] backdrop-blur-sm">
                <figcaption className="text-[11px] tracking-[0.14em] text-white/35 uppercase">{t("phraseLabel")}</figcaption>
                <blockquote className="mt-3 min-h-[2rem] text-[clamp(18px,4.5vw,21px)] leading-[1.6] tracking-[.2px] text-white/72">{phrase}</blockquote>
              </figure>
              <p className="mt-7 max-w-[390px] text-[13px] leading-[1.65] text-white/35">{t("presenceBody")}</p>
            </>
          )}
        </section>

        <button type="button" onClick={advance} className="mt-9 rounded-full border border-[rgba(200,160,30,0.45)] px-8 py-3 text-[13px] tracking-[0.1em] text-white/70 transition-colors duration-300 hover:border-[rgba(200,160,30,0.75)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[rgba(200,160,30,0.8)]">
          {beat === LAST_BEAT ? t("enter") : tc("continue")}
        </button>
      </main>
    </div>
  );
}

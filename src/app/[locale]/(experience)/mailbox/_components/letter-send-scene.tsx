"use client";

import { useTranslations } from "next-intl";

// ADR-004 #213, design B6: the envelope leaving the mailbox, choreographed like the transition
// before Observe (keyframes in globals.css, `letter-send-*`).
//
//   tracing  the paper slides in and a light runs around the contour from the stamp, while the
//            letter is being sent; if the answer takes longer, the lit contour waits, breathing
//   leaving  the letter is on its way (held for review): the contour breathes twice, the envelope
//            becomes a star that leaves with a trail, and the words appear
//   left     the same end, without replaying it (coming back to it after a language switch)
//   fading   the letter didn't leave: the light goes out, and the paper comes back to the person
//
// The envelope only leaves for a letter that's really on its way: the scene never shows "leaving"
// before the server said so.
export type LetterSendStage = "tracing" | "leaving" | "left" | "fading";

// How long the paper and the light take before the outcome may be shown.
export const LETTER_TRACE_MS = 1700;
// How long the light takes to go out before the paper comes back.
export const LETTER_FADE_MS = 600;

const CONTOUR = "M200 1 H243 Q249 1 249 7 V153 Q249 159 243 159 H7 Q1 159 1 153 V7 Q1 1 7 1 H200";

export function LetterSendScene({ stage }: { stage: LetterSendStage }) {
  const t = useTranslations("mailbox.send");
  const gone = stage === "leaving" || stage === "left";

  return (
    <div data-stage={stage} className={`flex w-full max-w-sm flex-col items-center ${stage === "left" ? "letter-send-still" : ""}`}>
      <div aria-hidden="true" className="relative h-[360px] w-[300px]">
        {stage === "tracing" && (
          <div className="letter-send-sheet absolute top-[182px] left-[70px] flex h-[104px] w-[160px] flex-col gap-[9px] rounded-[3px] bg-[#fbf8f2] px-3.5 pt-3.5">
            <span className="h-px bg-[rgba(42,38,32,0.18)]" />
            <span className="h-px bg-[rgba(42,38,32,0.18)]" />
            <span className="h-px w-[70%] bg-[rgba(42,38,32,0.18)]" />
          </div>
        )}

        <div
          data-envelope
          className={`absolute top-[170px] left-[25px] h-[160px] w-[250px] ${gone ? "letter-send-envelope-leaving" : ""}`}
        >
          <div className="relative h-[160px] w-[250px] -rotate-3">
            <div className="absolute inset-0 rounded-md bg-[#f2ede3] shadow-[0_20px_44px_rgba(0,0,0,0.5)]" />
            <svg width="250" height="160" viewBox="0 0 250 160" className="absolute top-0 left-0">
              <path d="M0 0 L125 84 L250 0" fill="none" stroke="rgba(42,38,32,0.25)" strokeWidth="1" />
            </svg>
            <div className="absolute top-3.5 right-3.5 flex h-14 w-[46px] items-end justify-center border border-[#c79a3a] bg-[#fbf8f2] pb-1 text-[5px] tracking-[1px] text-[#9a6d1c] outline-2 outline-offset-1 outline-[#fbf8f2] outline-dotted">
              REFUGIO
            </div>
            <svg width="254" height="164" viewBox="-2 -2 254 164" className="absolute -top-0.5 -left-0.5 overflow-visible">
              <path
                pathLength={100}
                d={CONTOUR}
                fill="none"
                stroke="#f2c063"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeDasharray="100"
                className={stage === "tracing" ? "letter-send-trace" : stage === "fading" ? "letter-send-fade" : ""}
              />
            </svg>
          </div>
        </div>

        {gone && (
          <>
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="letter-send-trail absolute top-[246px] left-[146px] size-2 rounded-full bg-[rgba(242,192,99,0.75)] shadow-[0_0_10px_3px_rgba(242,192,99,0.3)]"
                style={{ animationDelay: `${2090 + index * 90}ms` }}
              />
            ))}
            <svg
              data-star
              width="40"
              height="40"
              viewBox="-20 -20 40 40"
              className="letter-send-star absolute top-[230px] left-[130px] overflow-visible drop-shadow-[0_0_10px_rgba(242,192,99,0.9)]"
            >
              <path className="letter-send-star-glow" d="M0 -16 L4.5 -4.5 L16 0 L4.5 4.5 L0 16 L-4.5 4.5 L-16 0 L-4.5 -4.5 Z" fill="#fff8c8" />
            </svg>
          </>
        )}
      </div>

      <div role="status" className="mt-2 flex min-h-[1.6em] flex-col items-center gap-3.5 text-center">
        {stage === "tracing" && <p className="text-[12px] tracking-[.5px] text-white/50">{t("sealing")}</p>}
        {gone && (
          <div className="letter-send-reveal flex flex-col items-center gap-3.5">
            <p className="text-[22px] font-light tracking-[3px] text-white/90">{t("headline")}</p>
            <p className="max-w-[320px] text-[14px] leading-[1.6] text-white/65">{t("review")}</p>
            <p className="max-w-[320px] text-[13px] leading-[1.6] text-[rgba(242,192,99,0.85)]">{t("comeBack")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

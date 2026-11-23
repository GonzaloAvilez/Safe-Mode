"use client";

import { useMemo, type Ref } from "react";
import { useTranslations } from "next-intl";
import { CARD_COLORS } from "@/lib/return-key-card";
import { returnKeyQrPath } from "@/lib/return-key-qr";

// ADR-004 #212: the private card with the seal. A gift sentence and the seal's QR inside a
// postage stamp ("sello" is both the seal and the stamp that sends a letter). The seal's
// digits are never written out: the QR holds them, and it's what opens the mailbox (decided
// 2026-11-23). It's the same card "Guardar imagen" saves (lib/return-key-card.ts draws it on a
// canvas from the same layout), and it is private: nothing on it can be shared or says
// whose it is.
//
// The QR keeps a light field around it: the stamp's paper, with nothing drawn over it, so
// a camera can read it. Its modules are 14 pixels wide in the picture, 5.185 units here.
const QR_SIZE_UNITS = (21 * 14) / 2.7;

type ReturnKeyCardProps = {
  returnKey: string;
  sentence: string;
  ref?: Ref<HTMLDivElement>;
};

export function ReturnKeyCard({ returnKey, sentence, ref }: ReturnKeyCardProps) {
  const t = useTranslations("returnKeyCard");
  const qr = useMemo(() => returnKeyQrPath(returnKey), [returnKey]);

  return (
    <div
      ref={ref}
      className="flex h-[450px] w-[320px] flex-col items-center justify-between rounded-[20px] border border-[rgba(210,158,32,0.3)] bg-[#131315] px-[22px] pt-6 pb-5 text-center"
    >
      <span className="text-[10px] leading-3 tracking-[4px] text-white/[0.52]">{t("brand")}</span>

      <p
        data-card-sentence=""
        className="flex min-h-[72px] items-center text-base leading-[1.6] font-light text-white/[0.88]"
      >
        “{sentence}”
      </p>

      <svg viewBox="0 0 260 210" width="260" height="210" role="img" aria-label={t("qrLabel")}>
        <rect x="55" y="12" width="150" height="186" fill={CARD_COLORS.stampPaper} />
        <rect
          x="55"
          y="12"
          width="150"
          height="186"
          fill="none"
          stroke={CARD_COLORS.stampInk}
          strokeWidth="8"
          strokeDasharray="0 10"
          strokeLinecap="round"
        />
        <rect x="66" y="23" width="128" height="164" fill="none" stroke={CARD_COLORS.stampFrame} strokeWidth="1" />
        <svg
          x={130 - QR_SIZE_UNITS / 2}
          y="30"
          width={QR_SIZE_UNITS}
          height={QR_SIZE_UNITS}
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          shapeRendering="crispEdges"
        >
          <path fill={CARD_COLORS.stampInk} d={qr.path} />
        </svg>
        <text
          x="130"
          y="168"
          textAnchor="middle"
          fontSize="8"
          letterSpacing="2.5"
          fill={CARD_COLORS.stampText}
          style={{ fontFamily: "inherit" }}
        >
          {t("stamp")}
        </text>
        <g fill="none" stroke={CARD_COLORS.postmark} aria-hidden="true">
          <circle cx="224" cy="56" r="24" strokeOpacity="0.55" strokeWidth="1.2" />
          <circle cx="224" cy="56" r="18" strokeOpacity="0.4" strokeWidth="1" />
          <path
            d="M200 94 q7.5 -6 15 0 t15 0 t15 0 t12 0 M200 103 q7.5 -6 15 0 t15 0 t15 0 t12 0 M200 112 q7.5 -6 15 0 t15 0 t15 0 t12 0"
            strokeOpacity="0.5"
            strokeWidth="1.2"
          />
        </g>
      </svg>

      <span className="text-[11px] leading-[13px] tracking-[0.4px] text-white/[0.55]">{t("footer")}</span>
    </div>
  );
}

// The font family the card is really using, for the picture to draw with the same one.
export function readCardFonts(card: HTMLElement): { sans: string } {
  const sentence = card.querySelector("[data-card-sentence]");
  if (!sentence) throw new Error("the card has no [data-card-sentence]");
  return { sans: getComputedStyle(sentence).fontFamily };
}

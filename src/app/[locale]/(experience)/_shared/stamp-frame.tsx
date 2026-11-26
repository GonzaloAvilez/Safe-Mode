"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LETTER_TRACE_MS } from "./letters/letter-send-scene";

// ADR-004 (#292): checking a seal, drawn in line only so it blends with the site: thin gold on the
// dark background, no light fills. The seal is the person's key, so what's shown is their own
// picture (on /mailbox) or their own card (keeping the seal). Never a stand-in.
//
// The light that runs around the stamp is the envelope's own (`letter-send-trace`, `letter-send-fade`),
// so checking a seal and sending a letter feel like the same post office. The postmark lands only
// once the server has said yes: whoever shows these never moves to "stamped" before that answer.
// Keyframes in globals.css, `stamp-*` and `postmark-*`.

// The light goes round the stamp once before any answer is shown: the picture settles (600ms), then
// the light runs (1100ms), the same rhythm as the envelope leaving.
export const SEAL_CHECK_MS = LETTER_TRACE_MS;
// From "stamped" until the postmark has landed and stayed a moment.
export const POSTMARK_MS = 1100;
// From "failing" until the light is out and the picture is gone.
export const SEAL_FAIL_MS = 700;

// Where a seal's check is, as drawn on its stamp.
//   checking  the light runs around the stamp, then waits, breathing, for the answer
//   stamped   the server said yes: the postmark lands
//   failing   it said no: the light goes out
export type StampCheck = "checking" | "stamped" | "failing";

// The light around a stamp: a rounded rectangle as one path that starts at the middle of the top
// edge, so it runs from there all the way round.
export function StampLight({ x, y, width, height, check }: { x: number; y: number; width: number; height: number; check: StampCheck }) {
  const r = 4;
  const midX = x + width / 2;
  const d = `M${midX} ${y} H${x + width - r} Q${x + width} ${y} ${x + width} ${y + r} V${y + height - r} Q${x + width} ${y + height} ${
    x + width - r
  } ${y + height} H${x + r} Q${x} ${y + height} ${x} ${y + height - r} V${y + r} Q${x} ${y} ${x + r} ${y} H${midX}`;
  return (
    <path
      data-stamp-light
      pathLength={100}
      d={d}
      fill="none"
      stroke="#f2c063"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeDasharray="100"
      className={check === "checking" ? "letter-send-trace" : check === "failing" ? "letter-send-fade" : "stamp-light-lit"}
    />
  );
}

// A round postmark, "Correo de Refugio" along its edge, centred on (cx, cy).
export function Postmark({ cx, cy, r = 30 }: { cx: number; cy: number; r?: number }) {
  const t = useTranslations("returnKeyCard");
  const arcId = `postmark-arc-${useId().replace(/:/g, "")}`;
  const text = r - 7;
  return (
    <g data-postmark className="postmark-land" fill="none" stroke="#d29e20">
      <circle cx={cx} cy={cy} r={r} strokeWidth="1.6" strokeOpacity="0.9" />
      <circle cx={cx} cy={cy} r={r - 13} strokeWidth="1" strokeOpacity="0.7" />
      <defs>
        <path id={arcId} d={`M${cx - text} ${cy} a${text} ${text} 0 1 1 ${text * 2} 0 a${text} ${text} 0 1 1 ${-text * 2} 0`} />
      </defs>
      <text fill="#d29e20" stroke="none" fontSize="6.5" letterSpacing="1.6" style={{ fontFamily: "inherit" }}>
        <textPath href={`#${arcId}`}>{`${t("stamp")} · ${t("stamp")} ·`}</textPath>
      </text>
    </g>
  );
}

// /mailbox: the dashed frame where the seal's picture is shown. At rest it holds the invitation
// (children); once a picture is given it holds that picture, read from this device only.
//   closed          dashed, at rest
//   awaiting_drop   a picture is being dragged over the page: the frame turns gold
export type StampFrameStage = "closed" | "awaiting_drop" | StampCheck;

const FRAME_WIDTH = 170;
const FRAME_HEIGHT = 210;

export function StampFrame({ stage, picture, children }: { stage: StampFrameStage; picture: string | null; children: ReactNode }) {
  const check = stage === "checking" || stage === "stamped" || stage === "failing" ? stage : null;
  const showing = check !== null && picture !== null;

  return (
    <div data-stage={stage} className="relative h-[210px] w-[170px]">
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-4 text-center text-[13px] leading-[1.4] text-[rgba(242,237,227,0.85)] transition-[border-color,box-shadow,opacity] duration-300 ${
          showing
            ? "border-transparent"
            : stage === "awaiting_drop"
              ? "border-[#f2c063] bg-[rgba(242,237,227,0.04)] shadow-[0_0_18px_rgba(242,192,99,0.25)]"
              : "border-[rgba(242,237,227,0.35)] bg-[rgba(242,237,227,0.04)]"
        }`}
      >
        <div className={`flex flex-col items-center gap-3 transition-opacity duration-300 ${showing ? "opacity-0" : "opacity-100"}`}>{children}</div>
      </div>

      {showing && (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL of the person's own picture; nothing for next/image to optimize, and it must never leave the device.
        <img
          src={picture}
          alt=""
          data-seal-picture
          className={`absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain ${check === "failing" ? "stamp-picture-out" : "stamp-picture-in"}`}
        />
      )}

      {check && (
        <svg
          aria-hidden="true"
          width={FRAME_WIDTH + 4}
          height={FRAME_HEIGHT + 4}
          viewBox={`-2 -2 ${FRAME_WIDTH + 4} ${FRAME_HEIGHT + 4}`}
          className="pointer-events-none absolute -top-0.5 -left-0.5 overflow-visible"
        >
          <StampLight x={1} y={1} width={FRAME_WIDTH - 2} height={FRAME_HEIGHT - 2} check={check} />
          {check === "stamped" && <Postmark cx={FRAME_WIDTH - 46} cy={FRAME_HEIGHT - 58} r={34} />}
        </svg>
      )}
    </div>
  );
}

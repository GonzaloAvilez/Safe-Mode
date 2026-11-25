"use client";

import { useTranslations } from "next-intl";
import { LETTER_TRACE_MS } from "./letters/letter-send-scene";

// ADR-004 #213, design C (2026-11-25): the mailbox whose door is opened with the stamp. The stamp
// slot on the door is the lock. The light that runs around the door is the same light as the
// envelope leaving (`letter-send-trace`, `letter-send-fade`), so checking a seal and sending a
// letter feel like the same post office. Keyframes in globals.css, `mailbox-*`.
//
//   closed        the door shut, the slot empty
//   awaiting_drop a picture is being dragged over the page: the mailbox lifts, the slot glows
//   checking      the stamp flies into the slot, and the light runs around the door from it, then
//                 waits, breathing, until there's an answer
//   opening       the mailbox breathes and the door swings open on what's inside
//   failing       the light goes out and the stamp falls away
//
// The door only opens for a seal the server accepted: whoever shows this scene never moves to
// "opening" before that answer.
export type MailboxSceneStage = "closed" | "awaiting_drop" | "checking" | "opening" | "failing";

// What's behind the door: letters for a mailbox being opened. "empty" is for a mailbox that is only
// now being activated (#289).
export type MailboxSceneContents = "letters" | "empty";

// The light goes round the door once before any answer is shown: the stamp lands (600ms), then the
// light runs (1100ms), the same rhythm as the envelope leaving.
export const MAILBOX_CHECK_MS = LETTER_TRACE_MS;
// From "opening" until the door is open and what's inside has shown itself.
export const MAILBOX_OPEN_MS = 2400;
// From "failing" until the light is out and the stamp has fallen.
export const MAILBOX_FAIL_MS = 950;

const DOOR_CONTOUR = "M75 1 H143 Q149 1 149 7 V123 Q149 129 143 129 H7 Q1 129 1 123 V7 Q1 1 7 1 H75";

function Letter({ className }: { className: string }) {
  return (
    <div className={`absolute h-[46px] w-[74px] rounded-[3px] bg-[#fbf8f2] shadow-[0_3px_8px_rgba(0,0,0,0.4)] ${className}`}>
      <svg width="74" height="46" viewBox="0 0 74 46" className="absolute inset-0">
        <path d="M0 0 L37 24 L74 0" fill="none" stroke="rgba(42,38,32,0.2)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export function MailboxScene({ stage, contents }: { stage: MailboxSceneStage; contents: MailboxSceneContents }) {
  const t = useTranslations("returnKeyCard");
  const stamped = stage === "checking" || stage === "opening" || stage === "failing";

  return (
    <div data-stage={stage} aria-hidden="true" className="relative h-[226px] w-[200px]">
      <div
        data-mailbox
        className={`absolute top-0 left-[10px] h-[202px] w-[180px] transition-transform duration-300 ${
          stage === "awaiting_drop" ? "-translate-y-1.5" : ""
        } ${stage === "opening" ? "mailbox-breathe" : ""}`}
      >
        <div className="absolute inset-0 rounded-[90px_90px_6px_6px/54px_54px_6px_6px] bg-[#f2ede3] shadow-[0_18px_40px_rgba(0,0,0,0.5)]" />
        <div className="absolute top-[26px] left-[50px] h-1.5 w-20 rounded-full bg-[rgba(42,38,32,0.55)]" />

        <div className="absolute top-[56px] left-[15px] h-[130px] w-[150px] overflow-hidden rounded-[3px] bg-[#1d1c1a]">
          {contents === "letters" ? (
            <div data-contents="letters" className={stage === "opening" ? "mailbox-letters-peek" : ""}>
              <Letter className="top-[44px] left-[18px] -rotate-6" />
              <Letter className="top-[58px] left-[58px] rotate-[5deg]" />
            </div>
          ) : (
            <div
              data-contents="empty"
              className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_60%,rgba(242,192,99,0.28),rgba(242,192,99,0.06)_60%,transparent_85%)]"
            />
          )}
        </div>

        <div
          data-door
          className={`absolute top-[56px] left-[15px] h-[130px] w-[150px] origin-left rounded-[3px] border border-[rgba(42,38,32,0.22)] bg-[#ebe4d4] ${
            stage === "opening" ? "mailbox-door-open" : ""
          }`}
        >
          <div
            className={`absolute top-[20px] left-[54px] h-[50px] w-10 rounded-[2px] border-[1.5px] border-dashed transition-[border-color,box-shadow] duration-300 ${
              stage === "awaiting_drop"
                ? "border-[#f2c063] shadow-[0_0_14px_rgba(242,192,99,0.55)]"
                : "border-[rgba(42,38,32,0.35)]"
            }`}
          />
          {stamped && (
            <div
              data-stamp
              className={`absolute top-[20px] left-[54px] flex h-[50px] w-10 items-end justify-center border border-[#c79a3a] bg-[#fbf8f2] pb-1 text-[5px] tracking-[1px] text-[#9a6d1c] outline-2 outline-offset-1 outline-[#fbf8f2] outline-dotted ${
                stage === "checking" ? "mailbox-stamp-place" : stage === "failing" ? "mailbox-stamp-fall" : ""
              }`}
            >
              REFUGIO
            </div>
          )}
          <div className="absolute top-[82px] right-0 left-0 text-center text-[6.5px] tracking-[1.6px] text-[#9a6d1c]">{t("stamp")}</div>
          <div className="absolute top-[60px] right-[9px] size-[7px] rounded-full bg-[rgba(42,38,32,0.4)]" />
          {stamped && (
            <svg width="154" height="134" viewBox="-2 -2 154 134" className="absolute -top-0.5 -left-0.5 overflow-visible">
              <path
                pathLength={100}
                d={DOOR_CONTOUR}
                fill="none"
                stroke="#f2c063"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeDasharray="100"
                className={stage === "checking" ? "letter-send-trace" : stage === "failing" ? "letter-send-fade" : ""}
              />
            </svg>
          )}
        </div>
      </div>
      <div className="absolute top-[202px] left-[92px] h-6 w-4 rounded-b-[2px] bg-[#d6cdbb]" />
    </div>
  );
}

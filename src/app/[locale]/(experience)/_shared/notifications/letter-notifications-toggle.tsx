"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isLocale, DEFAULT_LOCALE } from "@/lib/locale";
import {
  getPushAvailability,
  getPushSubscriptionStatus,
  isPushBlocked,
  subscribeToPush,
  unsubscribeFromPush,
  type PushAvailability,
  type PushRequestFailure,
} from "@/lib/push-client";
import { isIosDevice } from "../return-key/download-blob";

// ADR-005: letter notices, offered only where the seal is already in memory (the Leave a Trace and
// Mirror closings, and the opened mailbox), so nobody is asked for the seal just to opt in. Off by
// default: it's offered, never asked for on arrival. Turning it off only stops this identity's
// notices on this device.
//
//   checking      asking whether this identity already gets notices here
//   off           offered: "Avisarme cuando llegue una carta"
//   turning_on    the browser's permission prompt and the subscription
//   on            "Recibirás un aviso…", with a way to stop
//   turning_off   removing this identity's row
//   blocked       notices were refused for this site; only the browser's settings can undo it
//   unknown       the check failed: it says so and offers to ask again, never showing notices as
//                 off to someone who may have them on
type ToggleState = "checking" | "off" | "turning_on" | "on" | "turning_off" | "blocked" | "unknown";

type ToggleMessage = "turnOnFailed" | "turnOffFailed" | "statusUnknown" | "tooMany" | "offline";

const noSubscription = () => () => {};

function failureMessage(reason: PushRequestFailure, fallback: ToggleMessage): ToggleMessage {
  if (reason === "too_many") return "tooMany";
  if (reason === "offline") return "offline";
  return fallback;
}

export function LetterNotificationsToggle({ returnKey, className = "" }: { returnKey: string; className?: string }) {
  const t = useTranslations("letterNotifications");
  const tc = useTranslations("common");
  const tn = useTranslations("letterNotice");
  const currentLocale = useLocale();
  const locale = isLocale(currentLocale) ? currentLocale : DEFAULT_LOCALE;
  const hintId = useId();
  // Read from the browser only: on the server, and while hydrating, nothing is offered.
  const availability = useSyncExternalStore<PushAvailability>(
    noSubscription,
    () => getPushAvailability({ isIos: isIosDevice() }),
    () => "unavailable"
  );
  const [state, setState] = useState<ToggleState>("checking");
  const [message, setMessage] = useState<ToggleMessage | null>(null);
  // Bumped to ask again after a failed check.
  const [checkAttempt, setCheckAttempt] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // What's true for this identity on this device, before anything is offered.
  useEffect(() => {
    if (availability !== "available") return;
    let current = true;
    void (async () => {
      if (isPushBlocked()) {
        if (current) setState("blocked");
        return;
      }
      const status = await getPushSubscriptionStatus(returnKey);
      if (!current) return;
      if (status.type === "unknown") {
        setState("unknown");
        setMessage(failureMessage(status.reason, "statusUnknown"));
      } else {
        setState(status.type === "subscribed" ? "on" : "off");
      }
    })();
    return () => {
      current = false;
    };
  }, [availability, returnKey, checkAttempt]);

  if (availability === "unavailable") return null;

  if (availability === "install_first") {
    return <p className={`max-w-[300px] text-center text-[12px] leading-[1.6] text-white/50 ${className}`}>{t("installFirst")}</p>;
  }

  // Keeps the place while checking, so nothing jumps when the answer arrives.
  if (state === "checking") return <div aria-hidden="true" className={`min-h-11 ${className}`} />;

  async function turnOn() {
    setState("turning_on");
    setMessage(null);
    const result = await subscribeToPush(returnKey, locale);
    if (!mounted.current) return;
    if (result.type === "subscribed") setState("on");
    else if (result.type === "blocked") setState("blocked");
    else {
      setState("off");
      if (result.type === "failed") setMessage(failureMessage(result.reason, "turnOnFailed"));
    }
  }

  async function turnOff() {
    setState("turning_off");
    setMessage(null);
    const result = await unsubscribeFromPush(returnKey);
    if (!mounted.current) return;
    if (result.type === "unsubscribed") setState("off");
    else {
      setState("on");
      setMessage(failureMessage(result.reason, "turnOffFailed"));
    }
  }

  const messageText =
    message === null ? null : message === "tooMany" ? tn("tooMany") : message === "offline" ? tc("errors.couldntConnect") : t(message);

  const status = (
    <p role="status" className="max-w-[300px] text-center text-[12px] leading-[1.6] text-white/65 empty:hidden">
      {messageText}
    </p>
  );

  function checkAgain() {
    setMessage(null);
    setState("checking");
    setCheckAttempt((attempt) => attempt + 1);
  }

  if (state === "unknown") {
    return (
      <div className={`flex flex-col items-center gap-2.5 ${className}`}>
        {status}
        <button
          type="button"
          onClick={checkAgain}
          className="min-h-11 text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75"
        >
          {t("checkAgain")}
        </button>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <p role="status" className="max-w-[300px] text-center text-[12px] leading-[1.6] text-white/50">
          {t("blocked")}
        </p>
      </div>
    );
  }

  if (state === "on" || state === "turning_off") {
    return (
      <div className={`flex flex-col items-center gap-2.5 ${className}`}>
        {/* The bell flows with the words, so a line that wraps keeps it beside its start. */}
        <p role="status" className="max-w-[300px] text-center text-[13px] leading-[1.6] text-[rgba(242,192,99,0.85)]">
          <BellIcon className="mr-1.5 inline-block align-[-2px]" />
          {t("on")}
        </p>
        <button
          type="button"
          onClick={turnOff}
          disabled={state === "turning_off"}
          className="min-h-11 text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75 disabled:pointer-events-none disabled:opacity-50"
        >
          {state === "turning_off" ? t("turningOff") : t("turnOff")}
        </button>
        {status}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2.5 ${className}`}>
      <button
        type="button"
        onClick={turnOn}
        disabled={state === "turning_on"}
        aria-describedby={hintId}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-[22px] text-[13px] tracking-[.5px] text-white/80 transition-all duration-300 hover:border-[rgba(210,158,32,0.55)] hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        <BellIcon />
        {state === "turning_on" ? t("turningOn") : t("turnOn")}
      </button>
      <p id={hintId} className="max-w-[300px] text-center text-[12px] leading-[1.6] text-white/45">
        {t("hint")}
      </p>
      {status}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="15" viewBox="0 0 14 15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
      <path d="M3 10.5V6.5a4 4 0 0 1 8 0v4l1.3 1.5H1.7L3 10.5z" strokeLinejoin="round" />
      <path d="M5.6 13.4a1.5 1.5 0 0 0 2.8 0" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useMailboxState } from "@/app/_components/experience-state/mailbox";
import type { Mailbox, MailboxCorrespondence } from "@/lib/mailbox";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { ScreenCta } from "../../_shared/screen-cta";
import { fetchMailboxWithReturnKey } from "./fetch-mailbox-with-return-key";
import { LETTER_FADE_MS, LETTER_TRACE_MS, LetterSendScene, type LetterSendStage } from "./letter-send-scene";
import { LETTER_MAX_CHARACTERS, sendLetter, type SendLetterResult } from "./send-letter";

// ADR-004 #213, design B5 and B6 (and C5, C6): writing the next letter, on paper, and sending it.
//
// "Cerrar el sobre" closes the envelope while the letter is sent, and the envelope leaves only for
// a letter that's really on its way (held for review). Anything else puts the light out and gives
// the paper back: with what to change (contact info, moderation), with help instead of a letter
// (a crisis), or with what's going on (letters paused, too many tries, no connection). The draft
// stays in memory until the letter leaves.

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

// The mailbox as the server will show it next time: this side's letter waiting for review, and
// the correspondence on its way. Saves asking the server again just to show the same thing.
function withLetterOnItsWay(mailbox: Mailbox | null, correspondenceId: string, body: string): Mailbox | null {
  if (!mailbox) return mailbox;
  return {
    correspondences: mailbox.correspondences.map((correspondence) =>
      correspondence.id !== correspondenceId
        ? correspondence
        : {
            ...correspondence,
            state: "awaiting_review",
            letters: [
              ...correspondence.letters,
              { sender: correspondence.yourSide, status: "held", body, createdAt: new Date().toISOString(), deliveredAt: null },
            ],
          }
    ),
  };
}

function CrisisHelp({ onBack }: { onBack: () => void }) {
  const t = useTranslations("mailbox");
  const [first, second] = t("crisis.headline").split("\n");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <div aria-hidden="true" className="relative mb-3 flex size-24 items-center justify-center">
        <span className="absolute size-24 rounded-full border border-[rgba(242,192,99,0.22)] bg-[rgba(242,192,99,0.06)]" />
        <span className="size-4 rounded-full bg-[#f2c063] shadow-[0_0_24px_8px_rgba(242,192,99,0.32)]" />
      </div>
      <h1 className="text-[22px] leading-[1.4] font-light tracking-[3px] text-white/90">
        {first}
        <br />
        {second}
      </h1>
      <p className="text-[14px] leading-[1.65] text-white/70">{t("crisis.intro")}</p>
      <a
        href={CRISIS_RESOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[15px] text-[rgba(242,192,99,0.9)] underline underline-offset-4"
      >
        {CRISIS_RESOURCE_URL.replace(/^https:\/\//, "")}
      </a>
      <p className="mt-3 text-[12px] leading-[1.6] text-white/45">{t("crisis.notSent")}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 text-[12px] tracking-[.5px] text-white/50 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80"
      >
        {t("letter.back")}
      </button>
    </div>
  );
}

export function WriteLetterStep({ correspondence }: { correspondence: MailboxCorrespondence }) {
  const t = useTranslations("mailbox");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {
    mailboxReturnKey: returnKey,
    setMailbox,
    mailboxPhase: phase,
    setMailboxPhase: setPhase,
    setOpenCorrespondenceId,
    letterDraft: draft,
    setLetterDraft: setDraft,
    letterOutcome: outcome,
    setLetterOutcome: setOutcome,
    startMailboxOperation,
    clearMailboxState,
  } = useMailboxState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot("letter");
  // Which part of the envelope's way this screen is showing, while it's the one sending.
  const [stage, setStage] = useState<LetterSendStage | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A send this screen didn't start (left mid-way, and the language switch is held while
  // sending) can't be finished from here: the paper comes back.
  useEffect(() => {
    if (phase === "sending" && stage === null) setPhase("writing");
  }, [phase, stage, setPhase]);

  function backToEnvelopes() {
    setOutcome(null);
    setOpenCorrespondenceId(null);
    setPhase("correspondences");
  }

  async function settle(result: SendLetterResult, text: string, isStillWanted: () => boolean) {
    if (result.type === "held") {
      setDraft("");
      setMailbox((mailbox) => withLetterOnItsWay(mailbox, correspondence.id, text));
      setStage("leaving");
      setPhase("sent");
      return;
    }

    // The letter didn't leave: the light goes out first.
    setStage("fading");
    await wait(prefersReducedMotion() ? 0 : LETTER_FADE_MS);
    if (!isStillWanted()) return;

    if (result.type === "not_recognized") {
      setStage(null);
      clearMailboxState();
      return;
    }
    if (result.type === "not_allowed") {
      // Someone else's move changed the turn meanwhile (another tab, a letter in review): show the
      // correspondence as it is now. The draft stays for when it's this side's turn again.
      const fresh = await fetchMailboxWithReturnKey(returnKey ?? "");
      if (!isStillWanted()) return;
      setStage(null);
      if (fresh.type === "opened") setMailbox(fresh.mailbox);
      setPhase("reading");
      return;
    }
    setStage(null);
    if (result.type === "crisis") setDraft("");
    setOutcome(result);
    setPhase("writing");
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    // The form is gone while sending, so it can only be sent once.
    if (!returnKey) return;
    const text = draft;
    if (text.trim() === "") return;

    const isCurrentMailbox = startMailboxOperation();
    const isStillWanted = () => mounted.current && isCurrentMailbox();
    setOutcome(null);
    setStage("tracing");
    setPhase("sending");
    lockLocaleSwitch();
    try {
      const [result] = await Promise.all([
        sendLetter({ correspondenceId: correspondence.id, returnKey, text, honeypot, formRenderedAt }),
        wait(prefersReducedMotion() ? 0 : LETTER_TRACE_MS),
      ]);
      if (!isStillWanted()) return;
      await settle(result, text, isStillWanted);
    } finally {
      unlockLocaleSwitch();
    }
  }

  if (phase === "sent") {
    return (
      <>
        <LetterSendScene stage={stage === "leaving" ? "leaving" : "left"} />
        {/* The way out appears with the words, once the envelope has left. */}
        <div data-way-out className={stage === "leaving" ? "letter-send-reveal-soft" : ""}>
          <button
            type="button"
            onClick={backToEnvelopes}
            className="text-[12px] tracking-[.5px] text-white/55 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/80"
          >
            {t("letter.back")}
          </button>
          <ScreenCta href="/" label={t("backToStart")} accentRgb="210,158,32" onClick={clearMailboxState} />
          {/* Room under the link for the fixed "back to start", so on a short phone it never covers it. */}
          <div aria-hidden="true" className="h-24" />
        </div>
      </>
    );
  }

  if (phase === "sending") return <LetterSendScene stage={stage === "fading" ? "fading" : "tracing"} />;

  if (outcome?.type === "crisis") return <CrisisHelp onBack={backToEnvelopes} />;

  let notice: string | null = null;
  if (outcome?.type === "rejected" && outcome.reason === "contact_info") {
    const things = new Intl.ListFormat(locale, { type: "conjunction" }).format(
      outcome.contactKinds.map((kind) => t(`write.contactKind.${kind}`))
    );
    notice = `${t("write.contactFound", { things })} ${t("write.contactRemove", { count: outcome.contactKinds.length })}`;
  } else if (outcome?.type === "rejected") {
    notice = t("write.moderation");
  } else if (outcome?.type === "letters_closed") {
    notice = t("write.lettersClosed");
  } else if (outcome?.type === "error") {
    notice =
      outcome.reason === "too_many"
        ? t("write.tooMany")
        : outcome.reason === "offline"
          ? tc("errors.couldntConnect")
          : t("write.failed");
  }

  return (
    <form onSubmit={send} className="flex w-full max-w-sm flex-col items-center gap-5">
      <h1 className="text-[22px] font-light tracking-[5px] text-white/82">{t("write.headline")}</h1>

      <label className="block w-full -rotate-[0.4deg] rounded-[4px] bg-[#f2ede3] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,rgba(42,38,32,0.08)_27px,rgba(42,38,32,0.08)_28px)] px-5 pt-5 pb-3 text-[#2a2620] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
        <span aria-hidden="true" className="block text-[10px] tracking-[1.5px] text-[rgba(42,38,32,0.55)] uppercase">
          {t("write.paperLabel", { number: correspondence.letters.length + 1 })}
        </span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={LETTER_MAX_CHARACTERS}
          placeholder={t("write.placeholder")}
          aria-label={t("write.fieldLabel")}
          aria-describedby="letter-notice"
          className="mt-2.5 block h-[280px] w-full resize-none bg-transparent p-0 text-[15px] leading-[28px] text-[#2a2620] outline-none placeholder:text-[rgba(42,38,32,0.4)]"
        />
        <span className="mt-2 flex justify-between text-[10px] text-[rgba(42,38,32,0.5)]">
          <span>{t("write.noContact")}</span>
          <span className="font-mono">
            {draft.length} / {LETTER_MAX_CHARACTERS}
          </span>
        </span>
      </label>
      <HoneypotField value={honeypot} onChange={setHoneypot} />

      <p id="letter-notice" role="status" className="min-h-[1.6em] text-center text-[13px] leading-[1.6] text-white/80">
        {notice}
      </p>
      <p className="-mt-3 text-center text-[12px] leading-[1.55] text-white/55">{t("write.review")}</p>

      <div className="flex flex-col items-center gap-3.5">
        <button
          type="submit"
          disabled={draft.trim() === ""}
          className="rounded-full border border-[rgba(210,158,32,0.6)] px-9 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          {t("write.send")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOutcome(null);
            setPhase("reading");
          }}
          className="text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75"
        >
          {t("write.notNow")}
        </button>
      </div>
    </form>
  );
}

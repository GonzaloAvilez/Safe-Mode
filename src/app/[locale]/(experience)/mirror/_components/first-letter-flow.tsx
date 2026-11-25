"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useRitualState, type MirrorLetter } from "@/app/_components/experience-state/ritual";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { LetterDraftPaper } from "../../_shared/letter-draft-paper";
import { LetterCrisisHelp } from "../../_shared/letters/letter-crisis-help";
import { LETTER_FADE_MS, LETTER_TRACE_MS, LetterSendScene, type LetterSendStage } from "../../_shared/letters/letter-send-scene";
import { sendFirstLetter } from "../../_shared/letters/send-letter";
import { isLetterNoticeOutcome, useLetterNotice } from "../../_shared/letters/use-letter-notice";
import { KeepReturnKeyStep } from "../../_shared/return-key/keep-return-key-step";
import { playTransition } from "../../_shared/handpan-audio";
import { ScreenHeader } from "../../_shared/screen-header";
import { CORNER_STAMP_CAPTION_CLASSES, CORNER_STAMP_CLASSES, PRESSABLE_STAMP_CLASSES } from "./corner-stamp";
import { requestVisitorReturnKey } from "./request-visitor-return-key";

// ADR-004 #212, design B ("Cartas desde Mirror"), with design A's desktop: writing a letter to
// whoever left the phrase Mirror showed. Seal first, then the paper:
//
//   the door     "Escribirle una carta", on the phrase, only when letters can reach its author
//   keeping      the card with their new seal (B1); keeping it confirms it, and only a confirmed
//                seal can send a letter
//   writing      the paper (B3); on desktop, next to their phrase (A)
//   sending      the envelope closes while the letter is sent (B6)
//   sent         the envelope has left (B4), and the way back to their phrase
//
// Everything lives in the ritual's memory (`mirrorLetter`): the seal never reaches the URL or
// browser storage, and leaving for the phrase ("Volver a su frase", "Ahora no") keeps the way, so
// the door picks up where it was without asking for another seal.

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

// This entry's letter, if there is one: a letter for another entry's phrase is never shown here.
export function useMirrorLetterFor(entryId: string): MirrorLetter | null {
  const { mirrorLetter } = useRitualState();
  return mirrorLetter?.entryId === entryId ? mirrorLetter : null;
}

function useUpdateMirrorLetter(entryId: string) {
  const { setMirrorLetter } = useRitualState();
  return (patch: Partial<Omit<MirrorLetter, "entryId">>) =>
    setMirrorLetter((current) => (current?.entryId === entryId ? { ...current, ...patch } : current));
}

type DoorMessage = "unavailable" | "lettersClosed" | "requestFailed" | "tooMany" | "offline";

// On the phrase, in place of "Me encantaría conectar" when letters can reach its author.
export function FirstLetterDoor({ entryId }: { entryId: string }) {
  const t = useTranslations("mirror.letter");
  const tc = useTranslations("common");
  const tn = useTranslations("letterNotice");
  const locale = useLocale();
  const { setMirrorLetter, startRitualOperation } = useRitualState();
  const letter = useMirrorLetterFor(entryId);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<DoorMessage | null>(null);
  const hintId = useId();
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (letter?.phase === "sent") {
    return (
      <p
        role="status"
        className={`relative mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(210,158,32,0.3)] px-5 text-[13px] tracking-[.5px] text-[rgba(242,192,99,0.85)] ${CORNER_STAMP_CLASSES}`}
      >
        <EnvelopeIcon />
        {t("onItsWay")}
        {/* On the desktop stamp, a postmark: this letter has left. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-4 -right-4 hidden h-12 w-12 rounded-full border border-dashed border-[rgba(242,192,99,0.45)] lg:block"
        />
      </p>
    );
  }

  // A door that can't open anymore (letters paused, or this phrase let go of them) stays closed.
  const closed = message === "unavailable" || message === "lettersClosed";

  // Asked only once at a time: the button is disabled while the seal is on its way.
  async function openDoor() {
    // Back to where they were, with the seal they already have.
    if (letter) {
      setMirrorLetter({ ...letter, backOnPhrase: false });
      playTransition();
      return;
    }

    setRequesting(true);
    setMessage(null);
    const isCurrentRitual = startRitualOperation();
    const result = await requestVisitorReturnKey({ entryId, locale });
    // Left Mirror, or started a new ritual, while the seal was on its way: the answer is let go,
    // so nothing opens on its own later. A seal created meanwhile was never confirmed, so it can
    // write nothing. A door still on screen stops waiting either way.
    if (!mounted.current) return;
    setRequesting(false);
    if (!isCurrentRitual()) return;

    if (result.type === "created") {
      setMirrorLetter({
        entryId,
        phase: "keeping",
        backOnPhrase: false,
        key: { returnKey: result.returnKey, sentence: result.sentence },
        draft: "",
        outcome: null,
      });
      playTransition();
      return;
    }
    setMessage(
      result.type === "unavailable"
        ? "unavailable"
        : result.type === "letters_closed"
          ? "lettersClosed"
          : result.reason === "too_many"
            ? "tooMany"
            : result.reason === "offline"
              ? "offline"
              : "requestFailed"
    );
  }

  const messageText =
    message === null
      ? null
      : message === "tooMany"
        ? tn("tooMany")
        : message === "offline"
          ? tc("errors.couldntConnect")
          : t(message);

  return (
    <div className="group mt-4 flex flex-col items-center lg:relative lg:mt-0">
      {!closed && (
        <button
          type="button"
          onClick={openDoor}
          disabled={requesting}
          aria-describedby={hintId}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(210,158,32,0.55)] bg-[rgba(200,160,30,0.08)] px-[22px] text-[13px] tracking-[.5px] text-[rgba(248,225,150,0.92)] transition-all duration-300 hover:scale-105 hover:bg-[rgba(200,160,30,0.14)] active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${CORNER_STAMP_CLASSES} ${PRESSABLE_STAMP_CLASSES}`}
        >
          <EnvelopeIcon />
          {requesting ? t("requesting") : t("writeButton")}
        </button>
      )}
      {/* Beside the stamp on desktop. A door that can't open anymore leaves no stamp to sit beside:
          its message takes the stamp's place, on a stamp of its own that can't be pressed. */}
      <div className={`flex flex-col items-center ${closed ? "" : `${CORNER_STAMP_CAPTION_CLASSES} lg:items-start`}`}>
        {/* On the desktop stamp the hint shows on hover or focus, unless a message is showing; it
            always describes the button. */}
        {!closed && (
          <p
            id={hintId}
            className={`mt-2.5 max-w-[280px] text-[12px] leading-[1.6] text-white/50 lg:mt-0 lg:opacity-0 lg:transition-opacity lg:duration-300 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 ${messageText ? "lg:hidden" : ""}`}
          >
            {t("writeHint")}
          </p>
        )}
        <p
          role="status"
          className={`mt-2 max-w-[280px] text-[13px] leading-[1.6] text-white/65 empty:hidden ${
            closed ? `lg:flex lg:border lg:border-white/15 lg:text-white/55 ${CORNER_STAMP_CLASSES}` : ""
          }`}
        >
          {messageText}
        </p>
      </div>
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x=".6" y=".6" width="14.8" height="10.8" rx="1.5" />
      <path d="M.8 1l7.2 5.4L15.2 1" />
    </svg>
  );
}

// The quiet scene every step of the letter shares: a soft glow, the tagline, content in the middle.
// A step taller than the phone starts lower (`spacing`), so it never sits under the fixed header.
function FirstLetterShell({ tagline, spacing = "py-24", children }: { tagline: string; spacing?: string; children: ReactNode }) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(210,158,32,0.05)_0%,rgba(210,158,32,0)_70%)]" />
      </div>
      <ScreenHeader tagline={tagline} />
      <div className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 ${spacing}`}>{children}</div>
    </>
  );
}

// The steps after the door, for as long as the visitor isn't back on the phrase.
export function FirstLetterFlow({ entryId, phraseText }: { entryId: string; phraseText: string }) {
  const t = useTranslations("mirror.letter");
  const tm = useTranslations("mirror");
  const tp = useTranslations("letterPaper");
  const letterNotice = useLetterNotice();
  const letter = useMirrorLetterFor(entryId);
  const updateMirrorLetter = useUpdateMirrorLetter(entryId);
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot("mirror-letter");
  // Which part of the envelope's way this screen is showing, while it's the one sending.
  const [stage, setStage] = useState<LetterSendStage | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A send this screen didn't start (it was left mid-way) can't be finished from here: the paper
  // comes back.
  useEffect(() => {
    if (letter?.phase === "sending" && stage === null) updateMirrorLetter({ phase: "writing" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter?.phase, stage]);

  if (!letter) return null;
  const { key } = letter;

  // Back on the phrase. From the closing, that's leaving it: the seal is let go.
  function backToPhrase() {
    updateMirrorLetter(letter?.phase === "sent" ? { backOnPhrase: true, key: null } : { backOnPhrase: true });
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    // The form is gone while sending, so it can only be sent once.
    if (!letter || !key) return;
    const text = letter.draft;
    if (text.trim() === "" || letter.outcome?.type === "unavailable") return;

    updateMirrorLetter({ phase: "sending", outcome: null });
    setStage("tracing");
    lockLocaleSwitch();
    try {
      const [result] = await Promise.all([
        sendFirstLetter({ entryId, returnKey: key.returnKey, text, honeypot, formRenderedAt }),
        wait(prefersReducedMotion() ? 0 : LETTER_TRACE_MS),
      ]);

      if (result.type === "held" || result.type === "already_on_its_way") {
        // The letter is on its way. The seal stays in memory on the closing, so it can offer letter
        // notices with it (ADR-005); it's let go once the person leaves the closing.
        updateMirrorLetter({ phase: "sent", draft: "", outcome: null });
        if (mounted.current) setStage(result.type === "held" ? "leaving" : "left");
        return;
      }

      // The letter didn't leave: the light goes out first, then the paper comes back.
      if (mounted.current) setStage("fading");
      await wait(prefersReducedMotion() ? 0 : LETTER_FADE_MS);
      if (mounted.current) setStage(null);
      updateMirrorLetter({ phase: "writing", outcome: result, ...(result.type === "crisis" ? { draft: "" } : {}) });
    } finally {
      unlockLocaleSwitch();
    }
  }

  if (letter.phase === "keeping" && key) {
    return (
      <FirstLetterShell tagline={t("keepTagline")} spacing="pt-40 pb-16">
        <h1 className="text-center text-[19px] leading-[1.45] font-light whitespace-pre-line text-white/90">{t("keepHeadline")}</h1>
        <KeepReturnKeyStep
          returnKey={key.returnKey}
          sentence={key.sentence}
          body={t("keepBody")}
          failedMessage={t("confirmFailed")}
          leaveLabel={t("backToPhrase")}
          onConfirmed={() => updateMirrorLetter({ phase: "writing" })}
          onLeave={backToPhrase}
        />
      </FirstLetterShell>
    );
  }

  if (letter.phase === "sent" || letter.phase === "sending") {
    const sent = letter.phase === "sent";
    return (
      <FirstLetterShell tagline={t("writingTagline")}>
        <LetterSendScene
          stage={sent ? (stage === "leaving" ? "leaving" : "left") : stage === "fading" ? "fading" : "tracing"}
          comeBack={t("comeBack")}
        />
        {sent && (
          // The way back appears with the words, once the envelope has left.
          <button
            type="button"
            onClick={backToPhrase}
            className={`group/enter flex flex-col items-center gap-2.5 ${stage === "leaving" ? "letter-send-reveal-soft" : ""}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 transition-all duration-400 group-hover/enter:scale-110 group-hover/enter:border-[rgba(170,130,230,0.7)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(170,130,230,0.55)] transition-colors group-hover/enter:bg-[rgba(170,130,230,0.9)]" />
            </span>
            <span className="text-[13px] tracking-[1px] text-white/40">{t("backToPhrase")}</span>
          </button>
        )}
      </FirstLetterShell>
    );
  }

  if (letter.outcome?.type === "crisis") {
    return (
      <FirstLetterShell tagline={t("writingTagline")}>
        <LetterCrisisHelp backLabel={t("backToPhrase")} onBack={() => updateMirrorLetter({ outcome: null, backOnPhrase: true })} />
      </FirstLetterShell>
    );
  }

  const outcome = letter.outcome;
  const unavailable = outcome?.type === "unavailable";
  const notice = !outcome
    ? null
    : unavailable
      ? t("unavailable")
      : isLetterNoticeOutcome(outcome)
        ? letterNotice(outcome)
        : null;

  return (
    <FirstLetterShell tagline={t("writingTagline")} spacing="pt-32 pb-16">
      <div className="flex w-full flex-col items-center lg:flex-row lg:items-center lg:justify-center">
        {/* Design A on desktop: their phrase next to the paper, joined by a thread of light. */}
        <div data-their-phrase className="hidden w-[340px] flex-col items-center gap-[18px] text-center lg:flex">
          <div className="w-full rounded-2xl border border-[rgba(165,125,220,0.28)] bg-[rgba(18,15,11,0.72)] px-6 py-[26px] shadow-[0_0_44px_-10px_rgba(165,125,220,0.35)]">
            <div className="font-serif text-[26px] leading-none text-[rgba(200,160,200,0.45)]">&ldquo;</div>
            <p className="mt-1 text-[18px] leading-[1.7] text-white/75 italic">{phraseText}</p>
            <div className="mt-3 text-[12px] tracking-[.5px] text-white/50">{tm("attribution")}</div>
          </div>
          <p className="max-w-[280px] text-[14px] leading-[1.7] text-white/55">{tm("subcopyMatched")}</p>
        </div>
        <div aria-hidden="true" className="hidden h-px w-[88px] bg-[linear-gradient(90deg,rgba(165,125,220,0.45),rgba(210,158,32,0.45))] lg:block" />

        <form onSubmit={send} className="flex w-full max-w-sm flex-col items-center gap-5 lg:w-[460px] lg:max-w-none">
          <h1 className="text-[22px] font-light tracking-[5px] text-white/82">{tp("headline")}</h1>
          <p className="-mt-2 text-center text-[13px] leading-[1.55] text-[rgba(200,175,255,0.7)] italic lg:hidden">
            {t("forPhrase", { phrase: phraseText })}
          </p>

          <LetterDraftPaper letterNumber={1} value={letter.draft} onChange={(draft) => updateMirrorLetter({ draft })} noticeId="first-letter-notice" />
          <HoneypotField value={honeypot} onChange={setHoneypot} />

          <p id="first-letter-notice" role="status" className="min-h-[1.6em] text-center text-[13px] leading-[1.6] text-white/80">
            {notice}
          </p>
          <p className="-mt-3 text-center text-[12px] leading-[1.55] text-white/55">{tp("review")}</p>

          <div className="flex flex-col items-center gap-3.5 lg:flex-row lg:gap-[22px]">
            <button
              type="submit"
              disabled={letter.draft.trim() === "" || unavailable}
              className="rounded-full border border-[rgba(210,158,32,0.6)] px-9 py-2.5 text-[13px] tracking-[1px] text-white/85 transition-colors duration-300 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              {tp("send")}
            </button>
            <button
              type="button"
              onClick={backToPhrase}
              className="text-[12px] tracking-[.5px] text-white/45 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/75"
            >
              {tp("notNow")}
            </button>
          </div>
        </form>
      </div>
    </FirstLetterShell>
  );
}

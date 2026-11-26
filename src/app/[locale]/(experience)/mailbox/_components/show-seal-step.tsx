"use client";

import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import { useMailboxState } from "@/app/_components/experience-state/mailbox";
import { ScreenPrompt } from "../../_shared/screen-prompt";
import { POSTMARK_MS, SEAL_CHECK_MS, SEAL_FAIL_MS, StampFrame, type StampFrameStage } from "../../_shared/stamp-frame";
import { fetchMailboxWithReturnKey } from "./fetch-mailbox-with-return-key";
import { readSealFromImage } from "../../_shared/return-key/read-seal-from-image";

// ADR-004 (#288, #292): the mailbox opens with the picture of the seal, the one "Guardar imagen"
// saved. Its QR is read here, on the device, and the picture goes nowhere: it's shown in the stamp
// frame from a local blob: URL, released afterwards. The picture is chosen by tapping the frame, or
// dropped anywhere on the page. There are no digits to type: the card stopped showing them on
// 2026-11-23, and every picture saved before that carries the QR.
//
// A seal that opens nothing gets one plain sentence (design C1), the same whether the picture
// held another seal or one that never existed: nothing that would help someone guess.

type Message = { text: string; hint?: string };

// Where the step is, once a picture was given:
//   reading     the QR is being read
//   opening     the server is being asked
//   opened      the server opened it: the postmark lands
//   not_opened  it didn't open: the light is going out, the reason is shown
type Progress = "reading" | "opening" | "opened" | "not_opened";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

// A drag carrying files from outside the page (a picture from the desktop or the photos app), not
// text or a link dragged within it.
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

// Lets go of the picture's blob: URL. Safe to call more than once: the URL is revoked only the first
// time, so the step going away and a check settling afterwards never revoke it twice.
function releasePreviewUrl(previewUrlRef: { current: string | null }) {
  if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  previewUrlRef.current = null;
}

function frameStage(progress: Progress | null, pictureOverPage: boolean): StampFrameStage {
  if (progress === "reading" || progress === "opening") return "checking";
  if (progress === "opened") return "stamped";
  if (progress === "not_opened") return "failing";
  return pictureOverPage ? "awaiting_drop" : "closed";
}

export function ShowSealStep() {
  const t = useTranslations("mailbox.show");
  const tc = useTranslations("common");
  const tCard = useTranslations("returnKeyCard");
  const { setMailboxReturnKey, setMailbox, setMailboxPhase, startMailboxOperation } = useMailboxState();
  const { lock: lockLocaleSwitch, unlock: unlockLocaleSwitch } = useLocaleTransition();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [imageUnread, setImageUnread] = useState(false);
  const [pictureOverPage, setPictureOverPage] = useState(false);
  const mounted = useRef(false);
  // Set as soon as a picture is taken, before the next render: two pictures given in a row (a drop
  // and a tap, a double drop) never start two openings.
  const sealCheckInFlight = useRef(false);
  // The picture being checked, shown in the frame: a blob: URL of this device's own file. The ref
  // holds the same URL for letting it go, which may happen after the step is gone.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  function showPicture(file: Blob) {
    releasePicture();
    // Showing it is only a courtesy: if this browser can't make a URL for it, the frame stays as it
    // is and the seal is still read and checked.
    try {
      previewUrlRef.current = URL.createObjectURL(file);
    } catch {
      previewUrlRef.current = null;
    }
    setPreviewUrl(previewUrlRef.current);
  }

  const releasePicture = () => releasePreviewUrl(previewUrlRef);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Whatever picture was still shown is let go of with the step; a check still pending finds
      // nothing left to release when it settles.
      releasePreviewUrl(previewUrlRef);
    };
  }, []);

  // Reading the picture, asking the server and the postmark take a moment, and the person
  // may leave meanwhile: "Volver al inicio" closes the mailbox, and going anywhere else takes this
  // step away. Either way, what arrives afterwards is for a mailbox nobody is waiting for, and must
  // not open it. The language switch is held for the whole operation, so changing language never
  // counts as leaving.
  async function openWithPicture(file: Blob) {
    if (sealCheckInFlight.current) return;
    sealCheckInFlight.current = true;
    const isCurrentMailbox = startMailboxOperation();
    const isStillWanted = () => mounted.current && isCurrentMailbox();
    const motion = !prefersReducedMotion();
    lockLocaleSwitch();
    try {
      setProgress("reading");
      setMessage(null);
      showPicture(file);
      // The light goes round the stamp at least once, however fast the answer: never a flicker.
      const lightWentRound = wait(motion ? SEAL_CHECK_MS : 0);

      const seal = await readSealFromImage(file);
      if (!isStillWanted()) return;
      if (!seal) {
        setImageUnread(true);
        await lightWentRound;
        if (!isStillWanted()) return;
        await notOpened({ text: t("noSealInImage"), hint: t("noSealInImageHint") }, motion);
        return;
      }
      setImageUnread(false);

      setProgress("opening");
      const [result] = await Promise.all([fetchMailboxWithReturnKey(seal), lightWentRound]);
      if (!isStillWanted()) return;

      if (result.type === "opened") {
        // Only now, with the server's answer, does the postmark land.
        setProgress("opened");
        await wait(motion ? POSTMARK_MS : 0);
        if (!isStillWanted()) return;
        setMailboxReturnKey(seal);
        setMailbox(result.mailbox);
        setMailboxPhase("correspondences");
        return;
      }

      await notOpened(
        result.type === "not_recognized"
          ? { text: t("notRecognized"), hint: t("notRecognizedHint") }
          : result.reason === "too_many"
            ? { text: t("tooMany") }
            : result.reason === "offline"
              ? { text: tc("errors.couldntConnect") }
              : { text: t("failed") },
        motion
      );
    } finally {
      unlockLocaleSwitch();
      sealCheckInFlight.current = false;
      // Whatever happened, this step can be used again (it's gone anyway if the mailbox opened).
      releasePicture();
      if (mounted.current) {
        setProgress(null);
        setPreviewUrl(null);
      }
    }
  }

  // The reason is shown at once; the light goes out and the picture fades before the step can be
  // used again.
  async function notOpened(reason: Message, motion: boolean) {
    setMessage(reason);
    setProgress("not_opened");
    await wait(motion ? SEAL_FAIL_MS : 0);
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same picture again is noticed too.
    event.target.value = "";
    if (file) void openWithPicture(file);
  }

  const dropPicture = useEffectEvent((file: File) => {
    void openWithPicture(file);
  });

  // The whole page takes a dropped picture, not only the frame: a picture dropped anywhere else
  // would otherwise be opened by the browser, leaving Refugio. Counted, because entering a child
  // element fires "dragleave" on the one before it.
  useEffect(() => {
    let depth = 0;
    function onDragEnter(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setPictureOverPage(true);
    }
    function onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPictureOverPage(false);
    }
    function onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setPictureOverPage(false);
      const file = event.dataTransfer?.files[0];
      if (file) dropPicture(file);
    }
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  const choose = imageUnread ? t("chooseAnother") : t("chooseImage");
  const status =
    progress === "reading" ? t("reading") : progress === "opening" || progress === "opened" ? t("opening") : message?.text;
  const showHint = (progress === null || progress === "not_opened") && message?.hint;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <ScreenPrompt headline={t("headline")} subcopy={t("subcopy")} />

      {/* Tapping the frame chooses the picture: the way on phones, where pictures are rarely
          dragged. */}
      <label
        className={`cursor-pointer rounded-md has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-[rgba(242,192,99,0.8)] ${
          progress !== null ? "pointer-events-none" : ""
        }`}
      >
        <StampFrame stage={frameStage(progress, pictureOverPage)} previewUrl={previewUrl}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>{choose}</span>
          <span className="hidden text-[11px] text-white/45 pointer-fine:block">{t("dropHint")}</span>
          <span aria-hidden="true" className="text-[10px] tracking-[2px] text-[rgba(224,169,58,0.8)]">
            {tCard("stamp")}
          </span>
        </StampFrame>
        <input type="file" accept="image/*" aria-label={choose} onChange={chooseImage} disabled={progress !== null} className="sr-only" />
      </label>

      <p className="-mt-1 max-w-[260px] text-center text-[11px] leading-[1.5] text-white/40">{t("imagePrivacy")}</p>

      <p role="status" className="min-h-[3.2em] text-center text-[13px] leading-[1.55] text-white/75">
        {status}
        {showHint && (
          <>
            <br />
            <span className="text-white/50">{message?.hint}</span>
          </>
        )}
      </p>
    </div>
  );
}

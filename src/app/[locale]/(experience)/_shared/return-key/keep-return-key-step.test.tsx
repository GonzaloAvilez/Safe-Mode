// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const { drawImageMock, downloadMock, readSealMock, confirmMock } = vi.hoisted(() => ({
  drawImageMock: vi.fn(),
  downloadMock: vi.fn(),
  readSealMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/return-key-card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-card")>()),
  drawReturnKeyCardImage: drawImageMock,
}));
vi.mock("./download-blob", () => ({ downloadBlob: downloadMock, isIosDevice: () => false }));
vi.mock("./read-seal-from-image", () => ({ readSealFromImage: readSealMock }));
vi.mock("./confirm-return-key", () => ({ confirmReturnKey: confirmMock }));

import { POSTMARK_MS, SEAL_CHECK_MS, SEAL_FAIL_MS } from "../stamp-frame";
import { SEAL_CONFIRMATION_ANIMATION_MS, KeepReturnKeyStep } from "./keep-return-key-step";

// The step's contract with whichever screen shows it (Leave a Trace and Mirror): the seal and the
// screen's own words go in; keeping the seal confirms it, and that, or leaving, comes back through
// the callbacks. Saving the picture on iPhone and its fonts are covered through Leave a Trace in
// keep-trace-seal-step.test.tsx.

const SEAL = "482133901756229";
const OTHER_SEAL = "735192048661347";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";
const K = es.returnKey.keep;
const PROPS = {
  returnKey: SEAL,
  sentence: SENTENCE,
  body: "Tu carta y su respuesta vivirán en un buzón que solo se abre con esto.",
  failedMessage: "No pudimos confirmar tu sello.",
  leaveLabel: "Volver a su frase",
};
const PICTURE = new File(["png"], "refugio-sello.png", { type: "image/png" });

const callbacks = { onConfirmed: vi.fn(), onLeave: vi.fn() };

function LockedReadout() {
  const { locked } = useLocaleTransition();
  // A plain span: an <output> would be a second status on the page.
  return <span data-testid="locked">{String(locked)}</span>;
}

function renderKeep(locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <ExperienceProviders>
        <KeepReturnKeyStep {...PROPS} {...callbacks} />
        <LockedReadout />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

const button = (name: string) => screen.queryByRole("button", { name });
const status = () => screen.getByRole("status").textContent;
const locked = () => screen.getByTestId("locked").textContent;
const pictureInput = (name = K.chooseImage) => screen.getByLabelText(name) as HTMLInputElement;

async function saveImage() {
  await act(async () => fireEvent.click(button(K.save)!));
}

async function choosePicture(name = K.chooseImage) {
  await act(async () => fireEvent.change(pictureInput(name), { target: { files: [PICTURE] } }));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
// The light goes round the card's stamp once before any answer is shown, the postmark takes its
// moment to land, and a seal that isn't kept puts the light out.
const lightGoesRound = () => advance(SEAL_CHECK_MS);
const postmarkLands = () => advance(POSTMARK_MS);
const lightGoesOut = () => advance(SEAL_FAIL_MS);

const stage = () => document.querySelector("[data-stage]")?.getAttribute("data-stage") ?? null;
// The card stays on screen the whole time: its own stamp is what's checked.
const cardShown = () => screen.queryByRole("img", { name: es.returnKeyCard.qrLabel }) !== null;
const postmark = () => document.querySelector("[data-postmark]");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  drawImageMock.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  readSealMock.mockResolvedValue(SEAL);
  confirmMock.mockResolvedValue({ type: "confirmed" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("KeepReturnKeyStep", () => {
  it("shows the seal and sentence it was given, with the screen's own words and way out", () => {
    renderKeep();

    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByRole("img", { name: es.returnKeyCard.qrLabel })).toBeTruthy();
    expect(screen.getByText(PROPS.body)).toBeTruthy();
    expect(button(PROPS.leaveLabel)).toBeTruthy();
  });

  it("never shows the seal's digits, and asks no one to type or write them down", () => {
    const { container } = renderKeep();

    expect(container.textContent).not.toMatch(/\d{5}/);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("speaks English with an English visitor", async () => {
    renderKeep("en");

    expect(button(en.returnKey.keep.save)).toBeTruthy();
    await act(async () => fireEvent.click(button(en.returnKey.keep.save)!));
    expect(pictureInput(en.returnKey.keep.chooseImage)).toBeTruthy();
  });

  describe("with the picture", () => {
    it("offers to choose the picture only once it was saved, and it's the main way on", async () => {
      renderKeep();
      expect(screen.queryByLabelText(K.chooseImage)).toBeNull();

      await saveImage();

      expect(drawImageMock).toHaveBeenCalledWith(expect.objectContaining({ returnKey: SEAL, sentence: SENTENCE }));
      expect(downloadMock).toHaveBeenCalledWith(expect.any(Blob), K.fileName);
      expect(screen.getByText(K.saved)).toBeTruthy();
      expect(pictureInput().accept).toBe("image/*");
      expect(screen.getByText(es.mailbox.show.imagePrivacy)).toBeTruthy();
      // Saving again stays possible, as a quieter way.
      expect(button(K.saveAgain)).toBeTruthy();
      expect(button(K.save)).toBeNull();
    });

    it("choosing the picture of this seal confirms it, says so, and moves on after a moment", async () => {
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(readSealMock).toHaveBeenCalledWith(PICTURE);
      expect(confirmMock).toHaveBeenCalledWith(SEAL);
      expect(status()).toBe(K.checking);

      await lightGoesRound();
      expect(status()).toBe(K.confirmed);
      expect(stage()).toBe("stamped");
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
      expect(locked()).toBe("true");

      await postmarkLands();
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
      expect(locked()).toBe("false");
      // Until the screen moves on, the postmark stays on the stamp.
      expect(stage()).toBe("stamped");
      expect(postmark()).toBeTruthy();
    });

    it("says it's checking while the picture is read and the seal confirmed, and only the way out can be pressed", async () => {
      let answer!: (result: { type: "confirmed" }) => void;
      confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(status()).toBe(K.checking);
      expect(pictureInput().disabled).toBe(true);
      expect((button(K.saveAgain) as HTMLButtonElement).disabled).toBe(true);
      // The way out stays open: a confirmation that never answers must not keep anyone here.
      expect((button(PROPS.leaveLabel) as HTMLButtonElement).disabled).toBe(false);

      await act(async () => answer({ type: "confirmed" }));
      await advance(SEAL_CONFIRMATION_ANIMATION_MS);
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    });

    it("a picture with no seal in it confirms nothing and asks for the saved one, whole", async () => {
      readSealMock.mockResolvedValue(null);
      renderKeep();
      await saveImage();

      await choosePicture();
      await lightGoesRound();

      expect(confirmMock).not.toHaveBeenCalled();
      expect(status()).toContain(es.mailbox.show.noSealInImage);
      expect(status()).toContain(es.mailbox.show.noSealInImageHint);
      expect(pictureInput(K.chooseAnother)).toBeTruthy();
      await lightGoesOut();
      expect(locked()).toBe("false");
    });

    it("the picture of another seal confirms nothing, and says so", async () => {
      readSealMock.mockResolvedValue(OTHER_SEAL);
      renderKeep();
      await saveImage();

      await choosePicture();
      await lightGoesRound();

      expect(confirmMock).not.toHaveBeenCalled();
      expect(status()).toBe(K.otherSeal);
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    });

    it("choosing again after a wrong picture works, and the message goes away", async () => {
      readSealMock.mockResolvedValueOnce(OTHER_SEAL);
      renderKeep();
      await saveImage();
      await choosePicture();
      await lightGoesRound();
      await lightGoesOut();

      await choosePicture(K.chooseAnother);
      await lightGoesRound();

      expect(confirmMock).toHaveBeenCalledWith(SEAL);
      expect(status()).toBe(K.confirmed);
    });

    it.each([
      ["too many tries", "too_many", K.tooMany],
      ["no connection", "offline", es.common.errors.couldntConnect],
      ["a failed confirmation", "failed", PROPS.failedMessage],
    ] as const)("after %s, it says why, and the person can choose the picture again", async (_label, reason, message) => {
      confirmMock.mockResolvedValue({ type: "error", reason });
      renderKeep();
      await saveImage();

      await choosePicture();
      await lightGoesRound();

      expect(status()).toBe(message);
      expect(stage()).toBe("failing");
      expect(pictureInput().disabled).toBe(true);

      await lightGoesOut();
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
      expect(locked()).toBe("false");
      expect(pictureInput().disabled).toBe(false);
      expect(status()).toBe(message);
    });

    it("checks only once while a check is under way", async () => {
      confirmMock.mockReturnValue(new Promise(() => {}));
      renderKeep();
      await saveImage();

      await choosePicture();
      await act(async () => fireEvent.change(pictureInput(), { target: { files: [PICTURE] } }));

      expect(readSealMock).toHaveBeenCalledOnce();
    });

    it("checks the card's own stamp in place: the card stays, and the light runs around its stamp", async () => {
      renderKeep();
      await saveImage();
      expect(stage()).toBeNull();
      expect(document.querySelector("[data-stamp-light]")).toBeNull();

      await choosePicture();

      expect(stage()).toBe("checking");
      expect(cardShown()).toBe(true);
      const card = screen.getByRole("img", { name: es.returnKeyCard.qrLabel });
      expect(card.querySelector("[data-stamp-light]")).toBeTruthy();
      expect(postmark()).toBeNull();
    });

    it("brings the card into view as its stamp is checked, the picture having been chosen further down", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      renderKeep();
      await saveImage();
      expect(scrollIntoView).not.toHaveBeenCalled();

      await choosePicture();

      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: "center" });
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });

    it("never lands the postmark before the server confirmed the seal, however long the light waits", async () => {
      let answer!: (result: { type: "confirmed" }) => void;
      confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderKeep();
      await saveImage();
      await choosePicture();

      await advance(SEAL_CHECK_MS * 3);
      expect(stage()).toBe("checking");
      expect(status()).toBe(K.checking);
      expect(postmark()).toBeNull();

      await act(async () => answer({ type: "confirmed" }));
      expect(stage()).toBe("stamped");
      expect(status()).toBe(K.confirmed);
    });

    it("a seal that isn't kept puts the stamp back as it was, with the reason, once the light is out", async () => {
      readSealMock.mockResolvedValue(OTHER_SEAL);
      renderKeep();
      await saveImage();
      await choosePicture();
      await lightGoesRound();
      expect(stage()).toBe("failing");
      expect(postmark()).toBeNull();

      await lightGoesOut();

      expect(stage()).toBeNull();
      expect(cardShown()).toBe(true);
      expect(status()).toBe(K.otherSeal);
      expect(button(K.saveAgain)).toBeTruthy();
    });

    it("with reduced motion, moves on as soon as the server confirms", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
      renderKeep();
      await saveImage();

      await choosePicture();
      // Nothing to wait for but the answers themselves: well under the light's round.
      await advance(10);

      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    });

    it("does nothing when the picker is closed without a picture", async () => {
      renderKeep();
      await saveImage();

      await act(async () => fireEvent.change(pictureInput(), { target: { files: [] } }));

      expect(readSealMock).not.toHaveBeenCalled();
      expect(status()).toBe("");
    });
  });

  it("if the picture can't be made, it says so and saving can be tried again", async () => {
    drawImageMock.mockRejectedValueOnce(new Error("canvas is not available"));
    renderKeep();

    await saveImage();
    expect(status()).toBe(K.imageError);
    expect(screen.queryByLabelText(K.chooseImage)).toBeNull();

    await saveImage();
    expect(screen.getByLabelText(K.chooseImage)).toBeTruthy();
    expect(status()).toBe("");
  });

  it("calls onLeave from the way out, and never confirms", () => {
    renderKeep();

    fireEvent.click(button(PROPS.leaveLabel)!);

    expect(callbacks.onLeave).toHaveBeenCalledOnce();
    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("leaving while the seal is checked lets go of everything, and a confirmation that answers later moves nothing on", async () => {
    let answer!: (result: { type: "confirmed" }) => void;
    confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderKeep();
    await saveImage();
    await choosePicture();
    await advance(SEAL_CHECK_MS * 3);
    expect(locked()).toBe("true");

    fireEvent.click(button(PROPS.leaveLabel)!);

    expect(callbacks.onLeave).toHaveBeenCalledOnce();
    expect(locked()).toBe("false");
    expect(stage()).toBeNull();
    expect(cardShown()).toBe(true);

    await act(async () => answer({ type: "confirmed" }));
    await advance(SEAL_CONFIRMATION_ANIMATION_MS);

    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    expect(stage()).toBeNull();
    expect(locked()).toBe("false");
  });

  it("a step still shown after leaving mid-check can keep the seal again", async () => {
    let answer!: (result: { type: "error"; reason: "offline" }) => void;
    confirmMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    renderKeep();
    await saveImage();
    await choosePicture();
    fireEvent.click(button(PROPS.leaveLabel)!);
    await act(async () => answer({ type: "error", reason: "offline" }));
    await advance(SEAL_CONFIRMATION_ANIMATION_MS);

    await choosePicture();
    await advance(SEAL_CONFIRMATION_ANIMATION_MS);

    expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
  });

  it("only the postmark's moment holds the way out, once the seal is already confirmed", async () => {
    renderKeep();
    await saveImage();
    await choosePicture();

    await lightGoesRound();

    expect(stage()).toBe("stamped");
    expect((button(PROPS.leaveLabel) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a step that's gone before the seal is confirmed never moves anything on", async () => {
    let answer!: (result: { type: "confirmed" }) => void;
    confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { unmount } = renderKeep();
    await saveImage();
    await choosePicture();

    unmount();
    await act(async () => answer({ type: "confirmed" }));
    await advance(SEAL_CONFIRMATION_ANIMATION_MS);

    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
  });

  it("a step that's gone while the postmark lands never moves anything on", async () => {
    const { unmount } = renderKeep();
    await saveImage();
    await choosePicture();
    await lightGoesRound();
    expect(status()).toBe(K.confirmed);

    unmount();
    await postmarkLands();

    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
  });
});

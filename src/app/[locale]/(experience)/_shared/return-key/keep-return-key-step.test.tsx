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

import { KEPT_MESSAGE_HOLD_MS, KeepReturnKeyStep } from "./keep-return-key-step";

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

async function holdElapses() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(KEPT_MESSAGE_HOLD_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  drawImageMock.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  readSealMock.mockResolvedValue(SEAL);
  confirmMock.mockResolvedValue({ type: "confirmed" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("KeepReturnKeyStep", () => {
  it("shows the seal and sentence it was given, with the screen's own words and way out", () => {
    renderKeep();

    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByText(PROPS.body)).toBeTruthy();
    expect(button(PROPS.leaveLabel)).toBeTruthy();
  });

  it("asks no one to type their seal: there's no field for digits", () => {
    renderKeep();

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByPlaceholderText("00000")).toBeNull();
  });

  it("speaks English with an English visitor", async () => {
    renderKeep("en");

    expect(button(en.returnKey.keep.save)).toBeTruthy();
    expect(button(en.returnKey.keep.wroteByHand)).toBeTruthy();
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
      expect(button(K.continue)).toBeNull();
    });

    it("choosing the picture of this seal confirms it, says so, and moves on after a moment", async () => {
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(readSealMock).toHaveBeenCalledWith(PICTURE);
      expect(confirmMock).toHaveBeenCalledWith(SEAL);
      expect(status()).toBe(K.confirmed);
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
      expect(locked()).toBe("true");

      await holdElapses();
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
      expect(locked()).toBe("false");
    });

    it("says it's checking while the picture is read and the seal confirmed, and nothing can be pressed", async () => {
      let answer!: (result: { type: "confirmed" }) => void;
      confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(status()).toBe(K.checking);
      expect(pictureInput().disabled).toBe(true);
      expect((button(K.saveAgain) as HTMLButtonElement).disabled).toBe(true);
      expect((button(K.wroteByHand) as HTMLButtonElement).disabled).toBe(true);
      expect((button(PROPS.leaveLabel) as HTMLButtonElement).disabled).toBe(true);

      await act(async () => answer({ type: "confirmed" }));
      await holdElapses();
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    });

    it("a picture with no seal in it confirms nothing and asks for the saved one, whole", async () => {
      readSealMock.mockResolvedValue(null);
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(confirmMock).not.toHaveBeenCalled();
      expect(status()).toContain(es.mailbox.show.noSealInImage);
      expect(status()).toContain(es.mailbox.show.noSealInImageHint);
      expect(pictureInput(K.chooseAnother)).toBeTruthy();
      expect(locked()).toBe("false");
    });

    it("the picture of another seal confirms nothing, and says so", async () => {
      readSealMock.mockResolvedValue(OTHER_SEAL);
      renderKeep();
      await saveImage();

      await choosePicture();

      expect(confirmMock).not.toHaveBeenCalled();
      expect(status()).toBe(K.otherSeal);
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    });

    it("choosing again after a wrong picture works, and the message goes away", async () => {
      readSealMock.mockResolvedValueOnce(OTHER_SEAL);
      renderKeep();
      await saveImage();
      await choosePicture();

      await choosePicture(K.chooseAnother);

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

      expect(status()).toBe(message);
      expect(callbacks.onConfirmed).not.toHaveBeenCalled();
      expect(locked()).toBe("false");
      expect(pictureInput().disabled).toBe(false);
    });

    it("checks only once while a check is under way", async () => {
      confirmMock.mockReturnValue(new Promise(() => {}));
      renderKeep();
      await saveImage();

      await choosePicture();
      await act(async () => fireEvent.change(pictureInput(), { target: { files: [PICTURE] } }));

      expect(readSealMock).toHaveBeenCalledOnce();
    });

    it("does nothing when the picker is closed without a picture", async () => {
      renderKeep();
      await saveImage();

      await act(async () => fireEvent.change(pictureInput(), { target: { files: [] } }));

      expect(readSealMock).not.toHaveBeenCalled();
      expect(status()).toBe("");
    });
  });

  describe("by hand", () => {
    it("asks the person to say they wrote it all down, and only then offers to go on", () => {
      renderKeep();

      fireEvent.click(button(K.wroteByHand)!);
      expect(button(K.continue)).toBeNull();

      const wroteItAll = screen.getByRole("checkbox", { name: K.wroteConfirm });
      fireEvent.click(wroteItAll);
      expect(button(K.continue)).toBeTruthy();

      fireEvent.click(wroteItAll);
      expect(button(K.continue)).toBeNull();
    });

    it("going on confirms the seal on their word, says so, and moves on after a moment", async () => {
      renderKeep();
      fireEvent.click(button(K.wroteByHand)!);
      fireEvent.click(screen.getByRole("checkbox", { name: K.wroteConfirm }));

      await act(async () => fireEvent.click(button(K.continue)!));

      expect(confirmMock).toHaveBeenCalledWith(SEAL);
      expect(readSealMock).not.toHaveBeenCalled();
      expect(status()).toBe(K.confirmed);
      await holdElapses();
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    });

    it("a failed confirmation says why and lets them go on again", async () => {
      confirmMock.mockResolvedValueOnce({ type: "error", reason: "failed" });
      renderKeep();
      fireEvent.click(button(K.wroteByHand)!);
      fireEvent.click(screen.getByRole("checkbox", { name: K.wroteConfirm }));

      await act(async () => fireEvent.click(button(K.continue)!));
      expect(status()).toBe(PROPS.failedMessage);

      await act(async () => fireEvent.click(button(K.continue)!));
      await holdElapses();
      expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    });

    it("before any picture is saved, it leaves saving it there and offers no picture to choose", () => {
      renderKeep();

      fireEvent.click(button(K.wroteByHand)!);

      expect(button(K.save)).toBeTruthy();
      expect(screen.queryByLabelText(K.chooseImage)).toBeNull();
    });

    it("is still there after saving the picture, for whoever can't find it", async () => {
      renderKeep();
      await saveImage();

      fireEvent.click(button(K.wroteByHand)!);

      expect(screen.getByRole("checkbox", { name: K.wroteConfirm })).toBeTruthy();
    });
  });

  it("calls onLeave from the way out, and never confirms", () => {
    renderKeep();

    fireEvent.click(button(PROPS.leaveLabel)!);

    expect(callbacks.onLeave).toHaveBeenCalledOnce();
    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("a step that's gone before the seal is confirmed never moves anything on", async () => {
    let answer!: (result: { type: "confirmed" }) => void;
    confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { unmount } = renderKeep();
    await saveImage();
    await choosePicture();

    unmount();
    await act(async () => answer({ type: "confirmed" }));
    await holdElapses();

    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
  });

  it("a step that's gone while “your seal is kept” shows never moves anything on", async () => {
    const { unmount } = renderKeep();
    await saveImage();
    await choosePicture();
    expect(status()).toBe(K.confirmed);

    unmount();
    await holdElapses();

    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
  });
});

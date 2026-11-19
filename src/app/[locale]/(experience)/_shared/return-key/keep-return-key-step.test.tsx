// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const { drawImageMock, downloadMock } = vi.hoisted(() => ({ drawImageMock: vi.fn(), downloadMock: vi.fn() }));

vi.mock("@/lib/return-key-card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-card")>()),
  drawReturnKeyCardImage: drawImageMock,
}));
vi.mock("./download-blob", () => ({ downloadBlob: downloadMock, isIosDevice: () => false }));

import { KeepReturnKeyStep } from "./keep-return-key-step";

// The step's contract with whichever screen shows it (Leave a Trace today, Mirror next): the
// seal and the screen's own words go in, and going on or leaving comes back through the
// callbacks. Saving the picture, iPhone and writing it down by hand are covered through Leave a
// Trace in keep-trace-seal-step.test.tsx.

const SEAL = "482133901756229";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";
const K = es.returnKey.keep;
const PROPS = {
  returnKey: SEAL,
  sentence: SENTENCE,
  body: "Tu carta y su respuesta vivirán en un buzón que solo se abre con esto.",
  leaveLabel: "Volver a su frase",
};

const callbacks = { onKept: vi.fn(), onLeave: vi.fn() };

function renderKeep(alreadyKept = false, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <KeepReturnKeyStep {...PROPS} {...callbacks} alreadyKept={alreadyKept} />
    </NextIntlClientProvider>
  );
}

const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  drawImageMock.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});

afterEach(() => {
  cleanup();
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

  it("speaks English with an English visitor", () => {
    renderKeep(false, "en");

    expect(button(en.returnKey.keep.save)).toBeTruthy();
    expect(button(en.returnKey.keep.wroteByHand)).toBeTruthy();
  });

  it("saves the picture of the seal it was given, then calls onKept on continuing", async () => {
    renderKeep();
    expect(button(K.continue)).toBeNull();

    await act(async () => fireEvent.click(button(K.save)!));
    expect(drawImageMock).toHaveBeenCalledWith(expect.objectContaining({ returnKey: SEAL, sentence: SENTENCE }));
    expect(downloadMock).toHaveBeenCalledWith(expect.any(Blob), K.fileName);

    fireEvent.click(button(K.continue)!);
    expect(callbacks.onKept).toHaveBeenCalledOnce();
  });

  it("lets someone who already kept it go on at once, without saving it twice", () => {
    renderKeep(true);

    fireEvent.click(button(K.continue)!);

    expect(callbacks.onKept).toHaveBeenCalledOnce();
    expect(drawImageMock).not.toHaveBeenCalled();
  });

  it("calls onLeave from the way out, and never onKept", () => {
    renderKeep();

    fireEvent.click(button(PROPS.leaveLabel)!);

    expect(callbacks.onLeave).toHaveBeenCalledOnce();
    expect(callbacks.onKept).not.toHaveBeenCalled();
  });
});

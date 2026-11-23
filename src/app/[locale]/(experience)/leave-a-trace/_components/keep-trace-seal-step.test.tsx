// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { drawImageMock, downloadMock, isIosMock, readSealMock, confirmMock } = vi.hoisted(() => ({
  drawImageMock: vi.fn(),
  downloadMock: vi.fn(),
  isIosMock: vi.fn(),
  readSealMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/return-key-card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-card")>()),
  drawReturnKeyCardImage: drawImageMock,
}));
vi.mock("../../_shared/return-key/download-blob", () => ({ downloadBlob: downloadMock, isIosDevice: isIosMock }));
vi.mock("../../_shared/return-key/read-seal-from-image", () => ({ readSealFromImage: readSealMock }));
vi.mock("../../_shared/return-key/confirm-return-key", () => ({ confirmReturnKey: confirmMock }));

import { KEPT_MESSAGE_HOLD_MS } from "../../_shared/return-key/keep-return-key-step";
import { KeepTraceSealStep } from "./keep-trace-seal-step";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

// Leave a Trace's own words for this step, and the ones every seal step shares.
const KEEP = { ...es.leaveATrace.keep, ...es.returnKey.keep };
const PICTURE = new Blob(["png"], { type: "image/png" });
const KEPT = { phase: "keeping" as const, key: { returnKey: SEAL, sentence: SENTENCE } };
const phase = () => screen.getByTestId("phase").textContent;
const button = (name: string) => screen.queryByRole("button", { name });

async function holdElapses() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(KEPT_MESSAGE_HOLD_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  drawImageMock.mockResolvedValue(PICTURE);
  isIosMock.mockReturnValue(false);
  readSealMock.mockResolvedValue(SEAL);
  confirmMock.mockResolvedValue({ type: "confirmed" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("KeepTraceSealStep", () => {
  it("shows the seal on the private card, and what it's for", () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByRole("img", { name: es.returnKeyCard.qrLabel })).toBeTruthy();
    expect(screen.getByText(KEEP.body)).toBeTruthy();
  });

  it("offers no way to go on until the person has saved the image or said they wrote the seal down", () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    expect(button(KEEP.continue)).toBeNull();
    expect(button(KEEP.save)).toBeTruthy();
    expect(button(KEEP.wroteByHand)).toBeTruthy();
  });

  it("saves the picture of the card, tells the person it's ready, and only then offers to choose it", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.saved);
    expect(drawImageMock).toHaveBeenCalledOnce();
    expect(drawImageMock.mock.calls[0][0]).toMatchObject({
      returnKey: SEAL,
      sentence: SENTENCE,
      labels: { brand: "REFUGIO", stamp: "CORREO DE REFUGIO", footer: "Este sello abre tus cartas." },
    });
    expect(downloadMock).toHaveBeenCalledWith(PICTURE, "refugio-sello.png");
    expect(screen.getByLabelText(KEEP.chooseImage)).toBeTruthy();
    expect(phase()).toBe("keeping");
  });

  it("asks for the card's own fonts, so the picture matches the screen", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await waitFor(() => expect(drawImageMock).toHaveBeenCalled());
    expect(drawImageMock.mock.calls[0][0].fonts).toEqual({ sans: expect.any(String), mono: expect.any(String) });
  });

  it("on iPhone, tells the person how to save the picture if it opens instead of downloading", async () => {
    isIosMock.mockReturnValue(true);
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.iosHint);
  });

  it("doesn't mention iPhone to anyone else", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.saved);
    expect(screen.queryByText(KEEP.iosHint)).toBeNull();
  });

  it("“Lo anoté a mano” asks the person to confirm they wrote it all down, and only then can they go on", () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.wroteByHand }));
    expect(button(KEEP.continue)).toBeNull();

    const confirm = screen.getByRole("checkbox", { name: KEEP.wroteConfirm });
    fireEvent.click(confirm);
    expect(button(KEEP.continue)).toBeTruthy();

    fireEvent.click(confirm);
    expect(button(KEEP.continue)).toBeNull();
  });

  it("lets the person write the seal down if the picture can't be made, and says so", async () => {
    drawImageMock.mockRejectedValue(new Error("canvas is not available"));
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.imageError);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(button(KEEP.continue)).toBeNull();
    expect(button(KEEP.wroteByHand)).toBeTruthy();
    expect((screen.getByRole("button", { name: KEEP.save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("choosing the saved picture seals the trace: the closing follows, and the seal leaves memory", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);
    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));
    const choose = (await screen.findByLabelText(KEEP.chooseImage)) as HTMLInputElement;

    await act(async () => fireEvent.change(choose, { target: { files: [new File(["png"], "sello.png", { type: "image/png" })] } }));
    expect(confirmMock).toHaveBeenCalledWith(SEAL);
    expect(phase()).toBe("keeping");

    await holdElapses();
    expect(phase()).toBe("sealed");
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("someone who wrote it down seals the trace on their word", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);
    fireEvent.click(screen.getByRole("button", { name: KEEP.wroteByHand }));
    fireEvent.click(screen.getByRole("checkbox", { name: KEEP.wroteConfirm }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: KEEP.continue })));
    await holdElapses();

    expect(confirmMock).toHaveBeenCalledWith(SEAL);
    expect(phase()).toBe("sealed");
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("if the trace can't be sealed, it says so in Leave a Trace's words and keeps the seal", async () => {
    confirmMock.mockResolvedValue({ type: "error", reason: "failed" });
    renderStep(<KeepTraceSealStep />, KEPT);
    fireEvent.click(screen.getByRole("button", { name: KEEP.wroteByHand }));
    fireEvent.click(screen.getByRole("checkbox", { name: KEEP.wroteConfirm }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: KEEP.continue })));

    expect(screen.getByText(KEEP.failed)).toBeTruthy();
    expect(phase()).toBe("keeping");
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
  });

  it("“Mejor sin cartas” is always there: it goes to the closing without saving anything, and lets go of the seal", async () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.withoutLetters }));

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(confirmMock).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();
  });

  it("letting go of the seal from elsewhere doesn't pull a later step back to the closing", async () => {
    renderStep(<KeepTraceSealStep />, { phase: "sealed", key: null });

    await act(async () => {});
    expect(phase()).toBe("sealed");
  });

  it("never puts the seal in the browser's storage or the address", () => {
    renderStep(<KeepTraceSealStep />, KEPT);

    expect(JSON.stringify({ ...localStorage })).not.toContain(SEAL);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SEAL);
    expect(window.location.href).not.toContain(SEAL);
    expect(document.cookie).not.toContain(SEAL);
  });

  it("holds no link and nothing to share", () => {
    const { container } = renderStep(<KeepTraceSealStep />, KEPT);

    expect(container.querySelector("a, [href], [data-share]")).toBeNull();
  });

  it("with no seal in memory (the ritual was reset) shows nothing and goes to the closing", async () => {
    const { container } = renderStep(<KeepTraceSealStep />, { phase: "keeping", key: null });

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(container.querySelector("[role=img]")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { drawImageMock, downloadMock, isIosMock } = vi.hoisted(() => ({
  drawImageMock: vi.fn(),
  downloadMock: vi.fn(),
  isIosMock: vi.fn(),
}));

vi.mock("@/lib/return-key-card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-card")>()),
  drawReturnKeyCardImage: drawImageMock,
}));
vi.mock("./download-blob", () => ({ downloadBlob: downloadMock, isIosDevice: isIosMock }));

import { KeepReturnKeyStep } from "./keep-return-key-step";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

const KEEP = es.leaveATrace.keep;
const PICTURE = new Blob(["png"], { type: "image/png" });
const KEPT = { phase: "keeping" as const, key: { returnKey: SEAL, sentence: SENTENCE } };
const phase = () => screen.getByTestId("phase").textContent;
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  drawImageMock.mockResolvedValue(PICTURE);
  isIosMock.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("KeepReturnKeyStep", () => {
  it("shows the seal as three lights over the private card, and what it's for", () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    // Each group appears twice: under its light and on the card.
    for (const group of ["48213", "39017", "56229"]) expect(screen.getAllByText(group).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("48213 · 39017 · 56229")).toBeTruthy();
    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByRole("img", { name: es.returnKeyCard.qrLabel })).toBeTruthy();
    expect(screen.getByText(KEEP.body)).toBeTruthy();
  });

  it("offers no way to go on until the person has saved the image or said they wrote the seal down", () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    expect(button(KEEP.continue)).toBeNull();
    expect(button(KEEP.save)).toBeTruthy();
    expect(button(KEEP.wroteByHand)).toBeTruthy();
  });

  it("saves the picture of the card, tells the person it's ready, and only then offers to continue", async () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.saved);
    expect(drawImageMock).toHaveBeenCalledOnce();
    expect(drawImageMock.mock.calls[0][0]).toMatchObject({
      returnKey: SEAL,
      sentence: SENTENCE,
      labels: { brand: "REFUGIO", stamp: "CORREO DE REFUGIO", footer: "Este sello abre tus cartas." },
    });
    expect(downloadMock).toHaveBeenCalledWith(PICTURE, "refugio-sello.png");
    expect(button(KEEP.continue)).toBeTruthy();
    expect(phase()).toBe("keeping");
  });

  it("asks for the card's own fonts, so the picture matches the screen", async () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await waitFor(() => expect(drawImageMock).toHaveBeenCalled());
    expect(drawImageMock.mock.calls[0][0].fonts).toEqual({ sans: expect.any(String), mono: expect.any(String) });
  });

  it("on iPhone, tells the person how to save the picture if it opens instead of downloading", async () => {
    isIosMock.mockReturnValue(true);
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.iosHint);
  });

  it("doesn't mention iPhone to anyone else", async () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.saved);
    expect(screen.queryByText(KEEP.iosHint)).toBeNull();
  });

  it("“Lo anoté a mano” asks the person to confirm they wrote it all down, and only then can they go on", () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

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
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));

    await screen.findByText(KEEP.imageError);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(button(KEEP.continue)).toBeNull();
    expect(button(KEEP.wroteByHand)).toBeTruthy();
    expect((screen.getByRole("button", { name: KEEP.save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("continuing lets go of the seal and goes to the closing", async () => {
    renderStep(<KeepReturnKeyStep />, KEPT);
    fireEvent.click(screen.getByRole("button", { name: KEEP.save }));
    await screen.findByText(KEEP.saved);

    fireEvent.click(screen.getByRole("button", { name: KEEP.continue }));

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("“Mejor sin cartas” is always there: it goes to the closing without saving anything, and lets go of the seal", async () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    fireEvent.click(screen.getByRole("button", { name: KEEP.withoutLetters }));

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(drawImageMock).not.toHaveBeenCalled();
  });

  it("never puts the seal in the browser's storage or the address", () => {
    renderStep(<KeepReturnKeyStep />, KEPT);

    expect(JSON.stringify({ ...localStorage })).not.toContain(SEAL);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SEAL);
    expect(window.location.href).not.toContain(SEAL);
    expect(document.cookie).not.toContain(SEAL);
  });

  it("holds no link and nothing to share", () => {
    const { container } = renderStep(<KeepReturnKeyStep />, KEPT);

    expect(container.querySelector("a, [href], [data-share]")).toBeNull();
  });

  it("with no seal in memory (the ritual was reset) shows nothing and goes to the closing", async () => {
    const { container } = renderStep(<KeepReturnKeyStep />, { phase: "keeping", key: null });

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(container.querySelector("[role=img]")).toBeNull();
  });
});

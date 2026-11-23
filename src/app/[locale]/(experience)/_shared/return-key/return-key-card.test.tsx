// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import jsQR from "jsqr";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import { ReturnKeyCard, readCardFonts } from "./return-key-card";

const SEAL = "482133901756229";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";

function renderCard(messages: typeof es | typeof en = es, locale = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ReturnKeyCard returnKey={SEAL} sentence={SENTENCE} />
    </NextIntlClientProvider>
  );
}

// The modules the screen draws for the QR, rebuilt from its SVG path and read like a camera would.
function scanCard(container: HTMLElement): string | undefined {
  const qr = container.querySelector('svg[role="img"] svg');
  const viewBox = qr!.getAttribute("viewBox")!.split(" ").map(Number);
  const size = viewBox[2];
  const scale = 8;
  const quiet = 4;
  const side = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [, x, y, width] of qr!.querySelector("path")!.getAttribute("d")!.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < Number(width) * scale; dx += 1) {
        const at = ((Number(y) + quiet) * scale + dy) * side + (Number(x) + quiet) * scale + dx;
        pixels.fill(0, at * 4, at * 4 + 3);
      }
    }
  }
  return jsQR(pixels, side, side)?.data;
}

afterEach(() => {
  cleanup();
});

describe("ReturnKeyCard", () => {
  it("shows the gift sentence, the seal's QR and the labels, in Spanish", () => {
    renderCard();

    expect(screen.getByText(`“${SENTENCE}”`)).toBeTruthy();
    expect(screen.getByText("REFUGIO")).toBeTruthy();
    expect(screen.getByText("Este sello abre tus cartas.")).toBeTruthy();
    expect(screen.getByText("CORREO DE REFUGIO")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Código QR de tu sello" })).toBeTruthy();
  });

  it("speaks English when the visitor does", () => {
    renderCard(en, "en");

    expect(screen.getByText("This seal opens your letters.")).toBeTruthy();
    expect(screen.getByText("REFUGIO POST")).toBeTruthy();
    expect(screen.getByRole("img", { name: "QR code of your seal" })).toBeTruthy();
  });

  it("never writes the seal's digits out: only its QR holds them", () => {
    const { container } = renderCard();

    expect(container.textContent).not.toMatch(/\d{5}/);
  });

  it("draws a QR that decodes to exactly the 15 digits", () => {
    const { container } = renderCard();

    expect(scanCard(container)).toBe(SEAL);
  });

  it("holds nothing that identifies anyone or can be shared: no link, no button", () => {
    const { container } = renderCard();

    expect(container.querySelector("a, button, input, [href]")).toBeNull();
    expect(container.textContent).not.toMatch(/https?:|www\./);
  });

  it("refuses a seal that isn't 15 digits", () => {
    expect(() =>
      render(
        <NextIntlClientProvider locale="es" messages={es}>
          <ReturnKeyCard returnKey="1234" sentence={SENTENCE} />
        </NextIntlClientProvider>
      )
    ).toThrow("not a 15-digit seal");
  });
});

describe("readCardFonts", () => {
  it("reads the family the card really uses, so the picture draws with the same one", () => {
    const { container } = renderCard();
    const card = container.firstElementChild as HTMLElement;
    (card.querySelector("[data-card-sentence]") as HTMLElement).style.fontFamily = "Geist, sans-serif";

    expect(readCardFonts(card)).toEqual({ sans: "Geist, sans-serif" });
  });

  it("fails clearly when the card is missing a part", () => {
    expect(() => readCardFonts(document.createElement("div"))).toThrow("the card has no [data-card-sentence]");
  });
});

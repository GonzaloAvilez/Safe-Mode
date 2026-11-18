// @vitest-environment jsdom
import jsQR from "jsqr";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CARD_IMAGE,
  CARD_LAYOUT,
  drawReturnKeyCard,
  drawReturnKeyCardImage,
  wrapLines,
  type ReturnKeyCardSpec,
} from "@/lib/return-key-card";

const SEAL = "482133901756229";
const SENTENCE = "Hay mañanas que empiezan por la tarde, y está bien.";
const SPEC: ReturnKeyCardSpec = {
  returnKey: SEAL,
  sentence: SENTENCE,
  labels: { brand: "REFUGIO", stamp: "CORREO DE REFUGIO", footer: "Este sello abre tus cartas." },
  fonts: { sans: "Geist, sans-serif", mono: "Geist Mono, monospace" },
};

type Call = { method: string; args: unknown[]; letterSpacing: string };

// A canvas context that records what is drawn. Every text is 8 units wide per character. Like
// Chrome after save() and scale(), it answers "" when asked for the letter spacing, so drawing
// code can't rely on reading it back.
function fakeContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { letterSpacing: "0px", font: "", fillStyle: "", globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, property: string) {
      if (property === "letterSpacing") return "";
      if (property in target) return target[property];
      if (property === "measureText") return (text: string) => ({ width: text.length * 8 });
      if (property === "createRadialGradient") return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => {
        calls.push({ method: property, args, letterSpacing: String(target.letterSpacing) });
      };
    },
    set(target, property: string, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const texts = (calls: Call[]) => calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));

// The rectangles drawn between setTransform(1,0,0,1,0,0) and restore(): the QR modules, in pixels.
function qrRects(calls: Call[]) {
  const start = calls.findIndex((c) => c.method === "setTransform");
  expect(start).toBeGreaterThan(-1);
  const end = calls.findIndex((c, index) => index > start && c.method === "restore");
  return calls
    .slice(start, end)
    .filter((c) => c.method === "fillRect")
    .map((c) => c.args as [number, number, number, number]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawReturnKeyCard", () => {
  it("draws at 2.7 pixels per design unit, for a 1080 × 1350 picture", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    expect(CARD_IMAGE).toEqual({ width: 1080, height: 1350 });
    expect(calls.find((c) => c.method === "scale")?.args).toEqual([2.7, 2.7]);
  });

  it("writes the gift sentence, the seal and the labels, and nothing else (no date, no link)", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    const written = texts(calls);
    expect(written).toContain("REFUGIO");
    expect(written).toContain("48213 · 39017 · 56229");
    expect(written).toContain("CORREO DE REFUGIO");
    expect(written).toContain("Este sello abre tus cartas.");
    expect(written.join(" ").replace(/\s+/g, " ")).toContain(`“${SENTENCE}”`);
    expect(written.join(" ")).not.toMatch(/https?:|www\.|\d{1,2}\/\d{1,2}\/|\d{4}-\d{2}-\d{2}/);
  });

  it("draws a QR that a reader decodes to exactly the 15 digits", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    const rects = qrRects(calls);
    expect(rects.length).toBeGreaterThan(20);
    const minX = Math.min(...rects.map(([x]) => x));
    const minY = Math.min(...rects.map(([, y]) => y));
    const side = Math.max(...rects.map(([x, , w]) => x + w)) - minX;
    const quiet = 4 * 14;
    const total = side + quiet * 2;
    const pixels = new Uint8ClampedArray(total * total * 4).fill(255);
    for (const [x, y, width, height] of rects) {
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const at = (y - minY + quiet + row) * total + (x - minX + quiet + column);
          pixels.fill(0, at * 4, at * 4 + 3);
        }
      }
    }

    expect(jsQR(pixels, total, total)?.data).toBe(SEAL);
    expect(side).toBe(21 * 14);
    // Whole pixels only, so no seams show between modules.
    expect(rects.every((rect) => rect.every(Number.isInteger))).toBe(true);
  });

  it("puts the QR inside the stamp's paper, with room around it", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    const rects = qrRects(calls);
    const left = Math.min(...rects.map(([x]) => x)) / 2.7;
    const right = Math.max(...rects.map(([x, , w]) => x + w)) / 2.7;
    const paper = calls.find((c) => c.method === "fillRect" && c.args[2] === 150 && c.args[3] === 186)!.args as number[];
    // At least 3.5 modules of paper on each side (a module is 14 / 2.7 units).
    expect(left - paper[0]).toBeGreaterThanOrEqual(3.5 * (14 / 2.7));
    expect(paper[0] + paper[2] - right).toBeGreaterThanOrEqual(3.5 * (14 / 2.7));
  });

  it("breaks a long sentence into lines that fit the card, and keeps every row inside it", () => {
    const long = "Hay cosas que solo se entienden con el corazón quieto, y también con el tiempo.";
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, { ...SPEC, sentence: long });

    const lines = texts(calls).filter((text) => text.includes("corazón") || text.includes("tiempo") || text.startsWith("“"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const innerWidth = CARD_LAYOUT.card.width - CARD_LAYOUT.card.paddingX * 2;
    for (const line of texts(calls).filter((t) => t !== "REFUGIO" && !t.includes("·") && !t.includes("sello") && !t.includes("CORREO"))) {
      expect(line.length * 8).toBeLessThanOrEqual(innerWidth);
    }
    const ys = calls.filter((c) => c.method === "fillText").map((c) => c.args[2] as number);
    expect(Math.min(...ys)).toBeGreaterThan(CARD_LAYOUT.card.y);
    expect(Math.max(...ys)).toBeLessThan(CARD_LAYOUT.card.y + CARD_LAYOUT.card.height);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys); // top to bottom, in order
  });

  it("lays the rows out from the top padding to the bottom one, sharing the leftover height", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    const textY = (text: string) => calls.find((c) => c.method === "fillText" && c.args[0] === text)!.args[2] as number;
    const { card, brandHeight, footerHeight } = CARD_LAYOUT;
    expect(textY("REFUGIO")).toBeCloseTo(card.y + card.paddingTop + brandHeight / 2, 5);
    expect(textY("Este sello abre tus cartas.")).toBeCloseTo(card.y + card.height - card.paddingBottom - footerHeight / 2, 5);
  });

  it("spaces only the letters that are meant to be spaced: the title, the seal, the stamp and the footer", () => {
    const { ctx, calls } = fakeContext();

    drawReturnKeyCard(ctx, SPEC);

    const spacingOf = (text: string) => calls.find((c) => c.method === "fillText" && c.args[0] === text)!.letterSpacing;
    expect(spacingOf("REFUGIO")).toBe("4px");
    expect(spacingOf("48213 · 39017 · 56229")).toBe("1px");
    expect(spacingOf("CORREO DE REFUGIO")).toBe("2.5px");
    expect(spacingOf("Este sello abre tus cartas.")).toBe("0.4px");
    // The sentence comes right after the title: it must not inherit the title's spacing.
    const sentenceLines = calls.filter((c) => c.method === "fillText" && /[“”]|empiezan|bien/.test(String(c.args[0])));
    expect(sentenceLines.length).toBeGreaterThan(0);
    expect(sentenceLines.every((c) => c.letterSpacing === "0px")).toBe(true);
  });

  it("uses the fonts it was given", () => {
    const { ctx } = fakeContext();
    const fonts: string[] = [];
    Object.defineProperty(ctx, "font", { set: (value: string) => fonts.push(value), get: () => "" });

    drawReturnKeyCard(ctx, SPEC);

    expect(fonts.some((font) => font.includes("Geist, sans-serif"))).toBe(true);
    expect(fonts.some((font) => font.includes("Geist Mono, monospace"))).toBe(true);
  });

  it("refuses a seal that isn't 15 digits: no card for something that isn't a key", () => {
    const { ctx } = fakeContext();

    expect(() => drawReturnKeyCard(ctx, { ...SPEC, returnKey: "48213" })).toThrow("not a 15-digit seal");
  });
});

describe("wrapLines", () => {
  const ctx = fakeContext().ctx;

  it("breaks between words when a line would be too wide", () => {
    expect(wrapLines(ctx, "uno dos tres cuatro", 80)).toEqual(["uno dos", "tres", "cuatro"]);
  });

  it("keeps a short text on one line", () => {
    expect(wrapLines(ctx, "hola mundo", 500)).toEqual(["hola mundo"]);
  });

  it("never loses a word that is wider than the line", () => {
    expect(wrapLines(ctx, "extraordinariamente corto", 40)).toEqual(["extraordinariamente", "corto"]);
  });

  it("returns no lines for an empty text", () => {
    expect(wrapLines(ctx, "   ", 100)).toEqual([]);
  });
});

describe("drawReturnKeyCardImage", () => {
  function stubCanvas(options: { context?: CanvasRenderingContext2D | null; blob?: Blob | null }) {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(options.context ?? null),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(options.blob ?? null)),
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
    Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
    return canvas;
  }

  it("waits for the fonts, draws on a 1080 × 1350 canvas and hands back the PNG", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const canvas = stubCanvas({ context: fakeContext().ctx, blob: png });

    await expect(drawReturnKeyCardImage(SPEC)).resolves.toBe(png);

    expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("doesn't touch the canvas until the page's fonts are ready", async () => {
    let fontsReady!: () => void;
    const canvas = stubCanvas({ context: fakeContext().ctx, blob: new Blob(["png"]) });
    Object.defineProperty(document, "fonts", {
      value: { ready: new Promise<void>((resolve) => (fontsReady = resolve)) },
      configurable: true,
    });

    const image = drawReturnKeyCardImage(SPEC);
    await Promise.resolve();
    expect(canvas.getContext).not.toHaveBeenCalled();

    fontsReady();
    await image;
    expect(canvas.getContext).toHaveBeenCalledOnce();
  });

  it("fails clearly when the browser gives no canvas", async () => {
    stubCanvas({ context: null });

    await expect(drawReturnKeyCardImage(SPEC)).rejects.toThrow("canvas is not available");
  });

  it("fails when the browser can't make the PNG", async () => {
    stubCanvas({ context: fakeContext().ctx, blob: null });

    await expect(drawReturnKeyCardImage(SPEC)).rejects.toThrow("couldn't make the image");
  });
});

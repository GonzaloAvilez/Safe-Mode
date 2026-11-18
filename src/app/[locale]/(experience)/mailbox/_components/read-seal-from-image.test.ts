import { encode } from "uqr";
import { describe, expect, it, vi } from "vitest";
import { readSealFromImage, readSealFromPixels } from "./read-seal-from-image";

const SEAL = "482133901756229";

// A QR as a picture: black modules on white, `scale` pixels each, with a quiet zone around it,
// the way the saved card shows it.
function qrPicture(text: string, scale = 8, quietModules = 4) {
  const modules = encode(text, { ecc: "Q", border: 0 }).data;
  const side = (modules.length + quietModules * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = (((y + quietModules) * scale + dy) * side + (x + quietModules) * scale + dx) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
      }
    })
  );
  return { pixels, side };
}

describe("readSealFromPixels", () => {
  it("reads the seal from the QR on the card", async () => {
    const { pixels, side } = qrPicture(SEAL);

    expect(await readSealFromPixels(pixels, side, side)).toBe(SEAL);
  });

  it("keeps the seal's leading zeros", async () => {
    const { pixels, side } = qrPicture("000120000300004");

    expect(await readSealFromPixels(pixels, side, side)).toBe("000120000300004");
  });

  it.each(["https://example.com/482133901756229", "48213", "hola"])(
    "returns null for a QR holding %j, which is not a seal",
    async (text) => {
      const { pixels, side } = qrPicture(text);

      expect(await readSealFromPixels(pixels, side, side)).toBeNull();
    }
  );

  it("returns null for a picture with no QR at all", async () => {
    const side = 200;

    expect(await readSealFromPixels(new Uint8ClampedArray(side * side * 4).fill(255), side, side)).toBeNull();
  });
});

describe("readSealFromImage", () => {
  it("returns null, never throws, when the browser can't decode the picture", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("not an image")));

    await expect(readSealFromImage(new Blob(["not a picture"]))).resolves.toBeNull();

    vi.unstubAllGlobals();
  });
});

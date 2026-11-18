import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { returnKeyQrModules, returnKeyQrPath } from "@/lib/return-key-qr";

const SCALE = 8;
const QUIET_ZONE = 4;

// What a phone camera would see: the modules as a black-on-white bitmap with the standard
// four-module quiet zone, decoded by an independent QR reader (jsQR).
function scan(modules: boolean[][]): string | undefined {
  const side = (modules.length + QUIET_ZONE * 2) * SCALE;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const at = ((y + QUIET_ZONE) * SCALE + dy) * side + (x + QUIET_ZONE) * SCALE + dx;
          pixels.fill(0, at * 4, at * 4 + 3);
        }
      }
    })
  );
  return jsQR(pixels, side, side)?.data;
}

// Rebuilds the module rows from the SVG path, so the test covers what the card actually draws.
function modulesFromPath({ path, size }: { path: string; size: number }): boolean[][] {
  const rows = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let dx = 0; dx < Number(width); dx += 1) rows[Number(y)][Number(x) + dx] = true;
  }
  return rows;
}

describe("returnKeyQrModules", () => {
  it.each(["482133901756229", "000000000000000", "999999999999999", "012345678901234", "100000000000001"])(
    "encodes exactly the 15 digits of %s, and nothing else",
    (seal) => {
      expect(scan(returnKeyQrModules(seal))).toBe(seal);
    }
  );

  it("is the smallest QR version, so its modules stay big", () => {
    const modules = returnKeyQrModules("482133901756229");

    expect(modules).toHaveLength(21);
    expect(modules.every((row) => row.length === 21)).toBe(true);
  });

  it("encodes random seals the way the app generates them", () => {
    for (let i = 0; i < 50; i += 1) {
      const seal = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join("");
      expect(scan(returnKeyQrModules(seal))).toBe(seal);
    }
  });

  it.each(["", "48213", "48213 39017 56229", "48213390175622a", "https://refugio.example/48213"])(
    "refuses %j: only a 15-digit seal goes in a QR, never a link",
    (input) => {
      expect(() => returnKeyQrModules(input)).toThrow("not a 15-digit seal");
    }
  );
});

describe("returnKeyQrPath", () => {
  it("draws the same modules the encoder made, still scannable", () => {
    const seal = "482133901756229";

    const path = returnKeyQrPath(seal);

    expect(path.size).toBe(21);
    expect(modulesFromPath(path)).toEqual(returnKeyQrModules(seal));
    expect(scan(modulesFromPath(path))).toBe(seal);
  });

  it("joins each run of dark modules into one rectangle", () => {
    const { path } = returnKeyQrPath("482133901756229");

    // The first row of any QR starts with the finder pattern: 7 dark modules in a row.
    expect(path.startsWith("M0 0h7v1h-7z")).toBe(true);
  });
});

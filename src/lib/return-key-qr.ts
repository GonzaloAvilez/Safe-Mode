import { encode } from "uqr";

// ADR-004 #212: the QR on the card encodes the 15 digits of the seal and nothing else:
// never a link, so a scan can't send anyone anywhere and the card carries no address. 15
// digits is numeric mode, which fits the smallest QR version (21 × 21 modules): big modules
// that stay easy to scan even from a screenshot. Error correction Q (about 25%) covers the
// wear of a screenshot or a compressed copy.
const SEAL_PATTERN = /^[0-9]{15}$/;

// Dark modules as rows of booleans, no border: the card draws its own light field around it.
export function returnKeyQrModules(seal: string): boolean[][] {
  if (!SEAL_PATTERN.test(seal)) throw new Error("not a 15-digit seal");
  return encode(seal, { ecc: "Q", border: 0 }).data;
}

// The same modules as one SVG path in module units (each dark run is one rectangle), plus the
// side length, so the card draws it at any size with a viewBox of `0 0 size size`.
export function returnKeyQrPath(seal: string): { path: string; size: number } {
  const modules = returnKeyQrModules(seal);
  let path = "";
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end += 1;
      path += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return { path, size: modules.length };
}

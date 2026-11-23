// ADR-004 #212: the seal ("48213 · 39017 · 56229") as three groups of five digits, the way the
// card prints it so it's easier to read and write down. Client-safe: no server imports, the
// seal never leaves memory (identity-keys.ts owns hashing and storage).

const SEAL_PATTERN = /^[0-9]{15}$/;

export type SealGroups = [string, string, string];

function assertSeal(seal: string): void {
  if (!SEAL_PATTERN.test(seal)) throw new Error("not a 15-digit seal");
}

export function splitReturnKeyGroups(seal: string): SealGroups {
  assertSeal(seal);
  return [seal.slice(0, 5), seal.slice(5, 10), seal.slice(10, 15)];
}

// The way the card prints it. The middle dot is only for the eyes: the server reads the
// seal with or without separators.
export function formatReturnKey(seal: string, separator = " · "): string {
  return splitReturnKeyGroups(seal).join(separator);
}

// What can stand between the digit groups when a seal is typed or read: spaces, hyphens, dots,
// and the middle dot the card shows.
const SEAL_SEPARATORS = /[\s.·-]/g;

// The seal in someone's text: typed by hand, or read from the QR on the saved picture. Only a
// whole seal counts: null for anything else, so nothing short of 15 digits is ever sent.
//
// The one place a seal is read. The browser uses it (the mailbox, and keeping the seal) and the
// server uses it before hashing (normalizeReturnKey in identity-keys.ts), so both always accept
// the same seals.
export function parseSeal(text: string): string | null {
  const digits = text.replace(SEAL_SEPARATORS, "");
  return SEAL_PATTERN.test(digits) ? digits : null;
}

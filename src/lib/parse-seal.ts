// ADR-004 #212: reading a seal, 15 digits. Client-safe: no server imports, the seal never leaves
// memory (identity-keys.ts owns hashing and storage).
//
// Since 2026-11-23 the card never prints the digits (the QR holds them), but seals kept before
// that were printed in three groups ("48213 · 39017 · 56229") and may have been written down, so
// a seal typed with those separators is still read.

const SEAL_PATTERN = /^[0-9]{15}$/;

// What can stand between the digit groups when a seal is typed or read: spaces, hyphens, dots,
// and the middle dot the card used to print.
const SEAL_SEPARATORS = /[\s.·-]/g;

// The seal in someone's text: read from the QR on the saved picture, or typed by hand. Only a
// whole seal counts: null for anything else, so nothing short of 15 digits is ever sent.
//
// The one place a seal is read. The browser uses it (the mailbox, and keeping the seal) and the
// server uses it before hashing (normalizeReturnKey in identity-keys.ts), so both always accept
// the same seals.
export function parseSeal(text: string): string | null {
  const digits = text.replace(SEAL_SEPARATORS, "");
  return SEAL_PATTERN.test(digits) ? digits : null;
}

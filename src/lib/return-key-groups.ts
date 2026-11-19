// ADR-004 #212: the seal ("48213 · 39017 · 56229") as three groups of five digits. The card
// shows them as three lights; sealing asks the person for one group picked at random, so
// only whoever has the whole seal outside the screen can answer. Client-safe: no server
// imports, the seal never leaves memory (identity-keys.ts owns hashing and storage).

const SEAL_PATTERN = /^[0-9]{15}$/;

export type SealGroupIndex = 0 | 1 | 2;
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

// The group to ask for. After the person looked at their seal again ("Volver a ver mi
// sello"), the next ask is a different group, so the seal can't be answered from memory of
// the last question.
export function pickAskedGroup(previous: SealGroupIndex | null = null, random: () => number = Math.random): SealGroupIndex {
  const candidates = ([0, 1, 2] as const).filter((index) => index !== previous);
  return candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)];
}

// What can stand between the digit groups when a seal is typed or read: spaces, hyphens, dots,
// and the middle dot the card shows.
const SEAL_SEPARATORS = /[\s.·-]/g;

// The seal in someone's text: typed by hand, or read from the QR on the saved picture. Only a
// whole seal counts: null for anything else, so nothing short of 15 digits is ever sent.
//
// The one place a seal is read. The mailbox uses it in the browser and the server uses it before
// hashing (normalizeReturnKey in identity-keys.ts), so both always accept the same seals.
export function parseSeal(text: string): string | null {
  const digits = text.replace(SEAL_SEPARATORS, "");
  return SEAL_PATTERN.test(digits) ? digits : null;
}

// What the person typed for the asked group, forgiving of spaces and the like: only the
// digits count, and they must be exactly that group's five.
export function isAskedGroupCorrect(seal: string, asked: SealGroupIndex, typed: string): boolean {
  return typed.replace(/[^0-9]/g, "") === splitReturnKeyGroups(seal)[asked];
}

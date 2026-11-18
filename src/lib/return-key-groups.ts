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

// What the person typed for the asked group, forgiving of spaces and the like: only the
// digits count, and they must be exactly that group's five.
export function isAskedGroupCorrect(seal: string, asked: SealGroupIndex, typed: string): boolean {
  return typed.replace(/[^0-9]/g, "") === splitReturnKeyGroups(seal)[asked];
}

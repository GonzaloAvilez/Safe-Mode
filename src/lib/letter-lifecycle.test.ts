import { describe, expect, it } from "vitest";
import {
  canSendLetter,
  isLetterTransitionAllowed,
  getCorrespondenceState,
  isCorrespondenceComplete,
  LETTERS_PER_SIDE,
  type CorrespondenceState,
  type LetterStatus,
  type Letter,
} from "@/lib/letter-lifecycle";

const visitor = (status: LetterStatus): Letter => ({ sender: "visitor", status });
const author = (status: LetterStatus): Letter => ({ sender: "author", status });
const open = (...letters: Letter[]) => ({ letters, closedAt: null });

// A complete back-and-forth of `rounds` delivered letters per side.
function deliveredRounds(rounds: number): Letter[] {
  return Array.from({ length: rounds }, () => [visitor("delivered"), author("delivered")]).flat();
}

describe("isLetterTransitionAllowed (single letter)", () => {
  const STATUSES: LetterStatus[] = ["draft", "moderating", "held", "rejected", "delivered"];
  const ALLOWED = new Set([
    "draft→moderating",
    "moderating→held",
    "moderating→rejected",
    "held→delivered",
    "held→rejected",
  ]);

  // Every pair, not just the allowed ones: a new transition must be added on purpose.
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to, ALLOWED.has(`${from}→${to}`)] as const));

  it.each(pairs)("%s → %s: %s", (from, to, allowed) => {
    expect(isLetterTransitionAllowed(from, to)).toBe(allowed);
  });
});

describe("getCorrespondenceState", () => {
  it.each<[string, Letter[], CorrespondenceState]>([
    ["new correspondence: the visitor writes first", [], "waiting_for_visitor"],
    ["visitor's letter waiting for review", [visitor("held")], "awaiting_review"],
    ["visitor's letter delivered", [visitor("delivered")], "waiting_for_author"],
    ["author's reply waiting for review", [visitor("delivered"), author("held")], "awaiting_review"],
    ["one full round", deliveredRounds(1), "waiting_for_visitor"],
    ["visitor's 3rd letter delivered", [...deliveredRounds(2), visitor("delivered")], "waiting_for_author"],
    ["visitor's letter rejected: still the visitor's turn", [visitor("rejected")], "waiting_for_visitor"],
    [
      "author's reply rejected: still the author's turn",
      [visitor("delivered"), author("rejected")],
      "waiting_for_author",
    ],
    [
      "several rejections don't use up turns",
      [visitor("rejected"), visitor("rejected"), visitor("delivered"), author("rejected")],
      "waiting_for_author",
    ],
    ["correspondence complete", deliveredRounds(LETTERS_PER_SIDE), "closed"],
  ])("%s", (_label, letters, expected) => {
    expect(getCorrespondenceState(open(...letters))).toBe(expected);
  });

  it("is closed once closed_at is set, even with a letter waiting for review", () => {
    expect(getCorrespondenceState({ letters: [visitor("held")], closedAt: "2026-11-09T00:00:00Z" })).toBe("closed");
  });

  it("doesn't depend on the order letters come in", () => {
    const inOrder = [visitor("delivered"), author("delivered"), visitor("delivered")];
    const shuffled = [visitor("delivered"), visitor("delivered"), author("delivered")];

    expect(getCorrespondenceState(open(...shuffled))).toBe(getCorrespondenceState(open(...inOrder)));
  });

  it.each<[string, Letter[]]>([
    ["two visitor letters with no reply", [visitor("delivered"), visitor("delivered")]],
    ["an author letter before any visitor letter", [author("delivered")]],
  ])("fails closed on a correspondence that breaks turn order: %s", (_label, letters) => {
    expect(() => getCorrespondenceState(open(...letters))).toThrow(/turn order/);
  });
});

describe("canSendLetter", () => {
  it.each<[string, Letter[], "visitor" | "author", ReturnType<typeof canSendLetter>]>([
    ["visitor starts a new correspondence", [], "visitor", { ok: true }],
    ["author can't write first", [], "author", { ok: false, reason: "not_your_turn" }],
    ["author replies to a delivered letter", [visitor("delivered")], "author", { ok: true }],
    ["visitor can't send two in a row", [visitor("delivered")], "visitor", { ok: false, reason: "not_your_turn" }],
    ["visitor can't write while their letter is in review", [visitor("held")], "visitor", { ok: false, reason: "awaiting_review" }],
    ["author can't write while the visitor's letter is in review", [visitor("held")], "author", { ok: false, reason: "awaiting_review" }],
    ["visitor retries after a rejection", [visitor("rejected")], "visitor", { ok: true }],
    ["author retries after a rejection", [visitor("delivered"), author("rejected")], "author", { ok: true }],
    ["author sends their 3rd letter", [...deliveredRounds(2), visitor("delivered")], "author", { ok: true }],
    ["nobody writes after the 6th letter", deliveredRounds(LETTERS_PER_SIDE), "visitor", { ok: false, reason: "closed" }],
  ])("%s", (_label, letters, sender, expected) => {
    expect(canSendLetter(open(...letters), sender)).toEqual(expected);
  });

  it("nobody writes in a correspondence closed for inactivity", () => {
    const closed = { letters: [visitor("delivered")], closedAt: "2026-11-09T00:00:00Z" };

    expect(canSendLetter(closed, "author")).toEqual({ ok: false, reason: "closed" });
  });
});

describe("isCorrespondenceComplete", () => {
  it.each<[string, Letter[], boolean]>([
    ["no letters", [], false],
    ["3 visitor letters, 2 author letters", [...deliveredRounds(2), visitor("delivered")], false],
    ["3 delivered each", deliveredRounds(LETTERS_PER_SIDE), true],
    [
      "author's 3rd still in review",
      [...deliveredRounds(2), visitor("delivered"), author("held")],
      false,
    ],
  ])("%s → %s", (_label, letters, expected) => {
    expect(isCorrespondenceComplete(letters)).toBe(expected);
  });
});

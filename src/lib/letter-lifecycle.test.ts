import { describe, expect, it } from "vitest";
import {
  canSend,
  canTransition,
  conversationState,
  isExchangeComplete,
  LETTERS_PER_SIDE,
  type ConversationState,
  type LetterStatus,
  type ThreadLetter,
} from "@/lib/letter-lifecycle";

const visitor = (status: LetterStatus): ThreadLetter => ({ sender: "visitor", status });
const author = (status: LetterStatus): ThreadLetter => ({ sender: "author", status });
const open = (...letters: ThreadLetter[]) => ({ letters, closedAt: null });

// A complete back-and-forth of `rounds` delivered letters per side.
function deliveredRounds(rounds: number): ThreadLetter[] {
  return Array.from({ length: rounds }, () => [visitor("delivered"), author("delivered")]).flat();
}

describe("canTransition (single letter)", () => {
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
    expect(canTransition(from, to)).toBe(allowed);
  });
});

describe("conversationState", () => {
  it.each<[string, ThreadLetter[], ConversationState]>([
    ["new conversation: the visitor writes first", [], "waiting_for_visitor"],
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
    ["exchange complete", deliveredRounds(LETTERS_PER_SIDE), "closed"],
  ])("%s", (_label, letters, expected) => {
    expect(conversationState(open(...letters))).toBe(expected);
  });

  it("is closed once closed_at is set, even with a letter waiting for review", () => {
    expect(conversationState({ letters: [visitor("held")], closedAt: "2026-11-09T00:00:00Z" })).toBe("closed");
  });

  it("doesn't depend on the order letters come in", () => {
    const inOrder = [visitor("delivered"), author("delivered"), visitor("delivered")];
    const shuffled = [visitor("delivered"), visitor("delivered"), author("delivered")];

    expect(conversationState(open(...shuffled))).toBe(conversationState(open(...inOrder)));
  });

  it.each<[string, ThreadLetter[]]>([
    ["two visitor letters with no reply", [visitor("delivered"), visitor("delivered")]],
    ["an author letter before any visitor letter", [author("delivered")]],
  ])("fails closed on a thread that breaks turn order: %s", (_label, letters) => {
    expect(() => conversationState(open(...letters))).toThrow(/turn order/);
  });
});

describe("canSend", () => {
  it.each<[string, ThreadLetter[], "visitor" | "author", ReturnType<typeof canSend>]>([
    ["visitor starts a new conversation", [], "visitor", { ok: true }],
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
    expect(canSend(open(...letters), sender)).toEqual(expected);
  });

  it("nobody writes in a conversation closed for inactivity", () => {
    const closed = { letters: [visitor("delivered")], closedAt: "2026-11-09T00:00:00Z" };

    expect(canSend(closed, "author")).toEqual({ ok: false, reason: "closed" });
  });
});

describe("isExchangeComplete", () => {
  it.each<[string, ThreadLetter[], boolean]>([
    ["no letters", [], false],
    ["3 visitor letters, 2 author letters", [...deliveredRounds(2), visitor("delivered")], false],
    ["3 delivered each", deliveredRounds(LETTERS_PER_SIDE), true],
    [
      "author's 3rd still in review",
      [...deliveredRounds(2), visitor("delivered"), author("held")],
      false,
    ],
  ])("%s → %s", (_label, letters, expected) => {
    expect(isExchangeComplete(letters)).toBe(expected);
  });
});

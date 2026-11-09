// ADR-004 #210, part B: the rules of a letter exchange, as pure functions. No database,
// no transport. Part C (safety pipeline), part D (review queue) and the API routes (#211)
// call into these so the rules live in exactly one place.
//
// Two levels (ADR-004 "Letter rules"):
//   - each letter has a stored status (connection_messages.status)
//   - the conversation's state is derived from its letters, never stored, except closed
//     (connection_requests.closed_at)

export type LetterSender = "visitor" | "author";
export type LetterStatus = "draft" | "moderating" | "held" | "rejected" | "delivered";

// Up to 3 letters per side, taking turns: the visitor writes first, so the exchange is
// complete after the author's 3rd letter is delivered.
export const LETTERS_PER_SIDE = 3;

// ---------------------------------------------------------------------------------------
// Level 1: a single letter
// ---------------------------------------------------------------------------------------

//   draft → moderating ─┬→ held ─┬→ delivered
//                       │        └→ rejected     (founder review)
//                       └→ rejected              (crisis, moderation, contact info)
//
// rejected and delivered are final: a reply is a new letter, never a new status.
const LETTER_TRANSITIONS: Record<LetterStatus, readonly LetterStatus[]> = {
  draft: ["moderating"],
  moderating: ["held", "rejected"],
  held: ["delivered", "rejected"],
  rejected: [],
  delivered: [],
};

export function canTransition(from: LetterStatus, to: LetterStatus): boolean {
  return LETTER_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------------------
// Level 2: the conversation
// ---------------------------------------------------------------------------------------

export type ConversationState =
  | "waiting_for_visitor" // the visitor's turn (always first)
  | "awaiting_review" // a letter is held, waiting for the founder
  | "waiting_for_author" // the author's turn
  | "closed"; // limit reached, or closed_at set (e.g. 60 days without activity)

export type ThreadLetter = { sender: LetterSender; status: LetterStatus };

export type Thread = {
  letters: readonly ThreadLetter[];
  closedAt: string | null;
};

function countDelivered(letters: readonly ThreadLetter[], sender: LetterSender): number {
  return letters.filter((letter) => letter.sender === sender && letter.status === "delivered").length;
}

export function isExchangeComplete(letters: readonly ThreadLetter[]): boolean {
  return (
    countDelivered(letters, "visitor") >= LETTERS_PER_SIDE && countDelivered(letters, "author") >= LETTERS_PER_SIDE
  );
}

// Whose turn it is comes from counting delivered letters, not from their order: turns
// alternate and the visitor starts, so equal counts mean the visitor's turn and one more
// visitor letter means the author's. That makes the result independent of how the
// letters were sorted. Rejected letters don't count (they don't use up the turn), and
// neither do draft/moderating, which are never stored (the pipeline runs before insert).
export function conversationState(thread: Thread): ConversationState {
  if (thread.closedAt !== null || isExchangeComplete(thread.letters)) return "closed";
  if (thread.letters.some((letter) => letter.status === "held")) return "awaiting_review";

  const visitor = countDelivered(thread.letters, "visitor");
  const author = countDelivered(thread.letters, "author");

  if (visitor === author) return "waiting_for_visitor";
  if (visitor === author + 1) return "waiting_for_author";

  // Only reachable if something wrote letters outside these rules. Fail closed rather
  // than guess whose turn it is.
  throw new Error(`Letter thread breaks turn order: ${visitor} visitor vs ${author} author letters delivered`);
}

export type SendCheck = { ok: true } | { ok: false; reason: "closed" | "awaiting_review" | "not_your_turn" };

// There's no separate "limit reached" answer: with alternating turns, a side can only
// reach its 3rd letter once the other side has too, which already closes the exchange.
export function canSend(thread: Thread, sender: LetterSender): SendCheck {
  const state = conversationState(thread);

  if (state === "closed") return { ok: false, reason: "closed" };
  if (state === "awaiting_review") return { ok: false, reason: "awaiting_review" };

  const turn: LetterSender = state === "waiting_for_visitor" ? "visitor" : "author";
  return turn === sender ? { ok: true } : { ok: false, reason: "not_your_turn" };
}

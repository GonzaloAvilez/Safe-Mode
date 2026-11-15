import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import {
  getCorrespondenceState,
  type Correspondence,
  type LetterSender,
  type LetterStatus,
} from "@/lib/letter-lifecycle";

// ADR-004 #211: the mailbox. Whoever holds a return key reads the correspondences their
// identity takes part in, seen from their own side: a visitor key opens the one
// correspondence it started, an author key opens every correspondence on the author's
// phrases. Seed phrases have no author identity: the founder reads their side in
// /admin/mailbox (getSeedPhraseMailbox, below).
//
// One principle decides what's shown (founder decision 2026-11-14): you only learn about
// a letter from the other side once it's delivered to you. Their letters waiting for
// review, or rejected, never appear, so nobody hears about a letter that may never arrive.
//
// Reading is not tracked: there's no "read" state, so the other side never gets a read
// receipt.

// The correspondence state (letter-lifecycle.ts), told from one side: waiting_for_visitor
// and waiting_for_author become your_turn / their_turn. awaiting_review only appears when
// the letter in review is yours; while theirs is, you see their_turn.
export type MailboxCorrespondenceState = "your_turn" | "their_turn" | "awaiting_review" | "closed";

export type MailboxLetter = {
  sender: LetterSender;
  status: "delivered" | "held" | "rejected";
  body: string | null; // null once retention has erased the text
  createdAt: string;
  deliveredAt: string | null;
};

// No identity or phrase ids: the id is the one POST /api/correspondences/[id]/letters
// needs, and phraseText is the context both sides share.
export type MailboxCorrespondence = {
  id: string;
  yourSide: LetterSender;
  state: MailboxCorrespondenceState;
  phraseText: string;
  letters: MailboxLetter[];
};

export type Mailbox = { correspondences: MailboxCorrespondence[] };

type LetterRejectionReason = "crisis" | "moderation" | "contact_info" | "review";

// What the visibility rule needs to know about a stored letter.
type LetterVisibilityFacts = {
  sender: LetterSender;
  status: LetterStatus;
  rejectionReason: LetterRejectionReason | null;
};

// Delivered letters, from either side. Of your own letters, also the one in review and
// the ones the founder rejected in review: that rejection is decided after you've left, so
// the mailbox is the only place you can learn about it. Rejections for crisis, moderation
// or contact info were already answered when you sent the letter.
export function isLetterVisibleTo(letter: LetterVisibilityFacts, side: LetterSender): boolean {
  if (letter.status === "delivered") return true;
  if (letter.sender !== side) return false;
  if (letter.status === "held") return true;
  return letter.status === "rejected" && letter.rejectionReason === "review";
}

// The visitor started the correspondence, so they always see it. The author only sees it
// once a letter has reached them: before that, a rejected first letter would leave them
// an empty correspondence from someone they never heard from.
export function isCorrespondenceVisibleTo(letters: readonly { status: LetterStatus }[], side: LetterSender): boolean {
  return side === "visitor" || letters.some((letter) => letter.status === "delivered");
}

export function getMailboxState(correspondence: Correspondence, side: LetterSender): MailboxCorrespondenceState {
  const state = getCorrespondenceState(correspondence);

  if (state === "closed") return "closed";
  if (state === "awaiting_review") {
    const held = correspondence.letters.find((letter) => letter.status === "held");
    return held?.sender === side ? "awaiting_review" : "their_turn";
  }

  const turn: LetterSender = state === "waiting_for_visitor" ? "visitor" : "author";
  return turn === side ? "your_turn" : "their_turn";
}

type MailboxLetterRow = {
  sender: LetterSender;
  status: LetterStatus;
  rejection_reason: LetterRejectionReason | null;
  body: string | null;
  created_at: string;
  delivered_at: string | null;
};

type MailboxCorrespondenceRow = {
  id: string;
  created_at: string;
  closed_at: string | null;
  phrases: { text: string };
  letters: MailboxLetterRow[];
};

const CORRESPONDENCE_COLUMNS =
  "id, created_at, closed_at, letters(sender, status, rejection_reason, body, created_at, delivered_at)";

function toMailboxCorrespondence(row: MailboxCorrespondenceRow, side: LetterSender): MailboxCorrespondence {
  const letters = row.letters
    .filter((letter) => isLetterVisibleTo({ ...letter, rejectionReason: letter.rejection_reason }, side))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((letter) => ({
      sender: letter.sender,
      status: letter.status as MailboxLetter["status"], // isLetterVisibleTo lets only these through
      body: letter.body,
      createdAt: letter.created_at,
      deliveredAt: letter.delivered_at,
    }));

  return {
    id: row.id,
    yourSide: side,
    // From every stored letter, the same ones canSendLetter reads when either side writes,
    // so the mailbox never says "your turn" where the letters route would refuse.
    state: getMailboxState({ letters: row.letters, closedAt: row.closed_at }, side),
    phraseText: row.phrases.text,
    letters,
  };
}

async function listCorrespondencesAsVisitor(identityId: string): Promise<MailboxCorrespondenceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select(`${CORRESPONDENCE_COLUMNS}, phrases(text)`)
    .eq("visitor_identity_id", identityId);
  if (error) throw error;
  return data as unknown as MailboxCorrespondenceRow[];
}

// !inner makes the filter on the phrase's author drop correspondences on other phrases,
// instead of keeping them with an empty phrase.
async function listCorrespondencesAsAuthor(identityId: string): Promise<MailboxCorrespondenceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select(`${CORRESPONDENCE_COLUMNS}, phrases!inner(text)`)
    .eq("phrases.identity_id", identityId);
  if (error) throw error;
  return data as unknown as MailboxCorrespondenceRow[];
}

// Seed phrases with no author identity: the ones the founder answers (isAnsweredByFounder
// in correspondences.ts, the same rule written as a query).
async function listSeedPhraseCorrespondences(): Promise<MailboxCorrespondenceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select(`${CORRESPONDENCE_COLUMNS}, phrases!inner(text)`)
    .eq("phrases.source", "seed")
    .is("phrases.identity_id", null);
  if (error) throw error;
  return data as unknown as MailboxCorrespondenceRow[];
}

type MailboxRow = { row: MailboxCorrespondenceRow; side: LetterSender };

// Newest correspondence first; letters oldest first inside each one.
function toMailbox(rows: MailboxRow[]): Mailbox {
  const correspondences = rows
    .filter(({ row, side }) => isCorrespondenceVisibleTo(row.letters, side))
    .sort((a, b) => b.row.created_at.localeCompare(a.row.created_at))
    .map(({ row, side }) => toMailboxCorrespondence(row, side));

  return { correspondences };
}

export async function getMailbox(identityId: string): Promise<Mailbox> {
  const [asVisitor, asAuthor] = await Promise.all([
    listCorrespondencesAsVisitor(identityId),
    listCorrespondencesAsAuthor(identityId),
  ]);

  return toMailbox([
    ...asVisitor.map((row) => ({ row, side: "visitor" as const })),
    ...asAuthor.map((row) => ({ row, side: "author" as const })),
  ]);
}

// The founder's mailbox in /admin/mailbox: the author's side of every correspondence on
// their seed phrases, with exactly the rules any author's mailbox follows. The founder
// still sees every held letter in /admin/letters, as the reviewer, not as the author.
export async function getSeedPhraseMailbox(): Promise<Mailbox> {
  const rows = await listSeedPhraseCorrespondences();
  return toMailbox(rows.map((row) => ({ row, side: "author" as const })));
}

// null when the key doesn't belong to any identity.
export async function getMailboxWithReturnKey(returnKey: string): Promise<Mailbox | null> {
  const identityId = await resolveIdentityFromReturnKey(returnKey);
  if (!identityId) return null;
  return getMailbox(identityId);
}

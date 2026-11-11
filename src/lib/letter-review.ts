import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { isCorrespondenceComplete, type Letter, type LetterSender } from "@/lib/letter-lifecycle";

// ADR-004 #210, part D: the founder's human review of letters before delivery (OD-1).
// A letter that passed the safety pipeline waits as "held" until the founder approves
// (delivered) or rejects (rejected, reason "review") it from /admin/letters.

// Promised to the sender: a letter can take up to 48h to arrive (ADR-004 "Letter rules").
export const REVIEW_PROMISE_HOURS = 48;
// From here on the queue highlights a letter, so the promise doesn't get missed.
export const REVIEW_WARNING_HOURS = 36;

export type ReviewUrgency = "on_time" | "due_soon" | "overdue";

export function getHoursAwaitingReview(createdAt: string, now: Date): number {
  return (now.getTime() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
}

export function getReviewUrgency(createdAt: string, now: Date): ReviewUrgency {
  const hours = getHoursAwaitingReview(createdAt, now);
  if (hours >= REVIEW_PROMISE_HOURS) return "overdue";
  if (hours >= REVIEW_WARNING_HOURS) return "due_soon";
  return "on_time";
}

// What the founder needs to decide, and nothing that identifies anyone: no identity or
// correspondence ids. Letters are linked to an identity (unlike entries), so the admin
// view shows only text, role and dates.
export type LetterAwaitingReview = {
  id: string;
  sender: LetterSender;
  body: string;
  createdAt: string;
  phraseText: string;
  // Letters already delivered in the same correspondence, oldest first, for context.
  // body is null once retention has anonymized it.
  deliveredLetters: { sender: LetterSender; body: string | null; deliveredAt: string }[];
};

type HeldLetterRow = {
  id: string;
  sender: LetterSender;
  body: string;
  created_at: string;
  correspondences: {
    phrases: { text: string };
    letters: { sender: LetterSender; body: string | null; status: string; delivered_at: string | null }[];
  };
};

// Oldest first: the letter closest to missing the 48h promise is reviewed first.
export async function listLettersAwaitingReview(): Promise<LetterAwaitingReview[]> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select(
      "id, sender, body, created_at, correspondences(phrases(text), letters(sender, body, status, delivered_at))"
    )
    .eq("status", "held")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data as unknown as HeldLetterRow[]).map((row) => ({
    id: row.id,
    sender: row.sender,
    body: row.body,
    createdAt: row.created_at,
    phraseText: row.correspondences.phrases.text,
    deliveredLetters: row.correspondences.letters
      .filter((letter) => letter.status === "delivered" && letter.delivered_at !== null)
      .map((letter) => ({ sender: letter.sender, body: letter.body, deliveredAt: letter.delivered_at as string }))
      .sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt)),
  }));
}

export async function countLettersAwaitingReview(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("letters")
    .select("id", { count: "exact", head: true })
    .eq("status", "held");
  if (error) throw error;
  return count ?? 0;
}

export type LetterReviewResult = { ok: true } | { ok: false; reason: "already_decided" };

// Every decision updates the letter only if it's STILL held. That condition is the
// held → delivered/rejected transition guard, and it makes a double click (or two open
// tabs) harmless: the second update matches no row and answers "already_decided".

export async function approveLetter(letterId: string): Promise<LetterReviewResult> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("letters")
    .update({ status: "delivered", delivered_at: now })
    .eq("id", letterId)
    .eq("status", "held")
    .select("correspondence_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "already_decided" };

  // The letter is delivered at this point; a failure to also set closed_at mustn't
  // report the approval as failed (see closeCorrespondenceIfComplete for why it's safe).
  try {
    await closeCorrespondenceIfComplete(data.correspondence_id, now);
  } catch (error) {
    console.error("approveLetter: couldn't set closed_at, correspondence still reads as closed", error);
  }
  return { ok: true };
}

export async function rejectLetter(letterId: string): Promise<LetterReviewResult> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .update({ status: "rejected", rejection_reason: "review" })
    .eq("id", letterId)
    .eq("status", "held")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "already_decided" };

  return { ok: true };
}

// After the 6th delivered letter (3 per side) the correspondence is closed. This is a
// second write without a transaction, but that's safe: getCorrespondenceState also
// derives "closed" from the letters themselves, so even if this update failed the
// correspondence would still read as closed. closed_at is never overwritten.
async function closeCorrespondenceIfComplete(correspondenceId: string, now: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("sender, status")
    .eq("correspondence_id", correspondenceId);
  if (error) throw error;
  if (!isCorrespondenceComplete(data as Letter[])) return;

  const { error: closeError } = await supabaseAdmin
    .from("correspondences")
    .update({ closed_at: now })
    .eq("id", correspondenceId)
    .is("closed_at", null);
  if (closeError) throw closeError;
}

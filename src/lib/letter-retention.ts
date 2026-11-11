import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { CRISIS_RETENTION_DAYS } from "@/lib/crisis-entries";

// ADR-004 #210, part E: retention for letters (ADR-004 "Letter rules"), run daily by
// /api/cron/apply-letter-retention.
//
// What's waiting for the founder's review is never touched (decided 2026-11-11): a held
// letter isn't anonymized (the founder would be left reviewing an empty letter), and a
// correspondence with a held letter isn't closed (approving it would deliver into a
// closed correspondence). With the 48h review promise this should never come up.

export const LETTER_RETENTION_DAYS = 60;
// Same rule as crisis entries, imported so the two can't drift apart.
export const CRISIS_LETTER_RETENTION_DAYS = CRISIS_RETENTION_DAYS;
export const CORRESPONDENCE_INACTIVITY_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

// Erases a letter's text once it's older than its retention window: 30 days for crisis
// letters, 60 for every other letter that isn't held. Letters without text (contact-info
// rejections, already anonymized ones) are skipped, so the count only reflects text that
// was actually erased and running the job twice changes nothing the second time. That
// skip is also why the 60-day pass needs no "except crisis" filter: by then the 30-day
// pass has already erased every crisis letter old enough to match.
export async function anonymizeExpiredLetters(now: Date = new Date()): Promise<number> {
  const erase = { body: null, anonymized_at: now.toISOString() };

  const crisis = await supabaseAdmin
    .from("letters")
    .update(erase)
    .eq("rejection_reason", "crisis")
    .lt("created_at", daysBefore(now, CRISIS_LETTER_RETENTION_DAYS).toISOString())
    .not("body", "is", null)
    .select("id");
  if (crisis.error) throw crisis.error;

  const others = await supabaseAdmin
    .from("letters")
    .update(erase)
    .neq("status", "held")
    .lt("created_at", daysBefore(now, LETTER_RETENTION_DAYS).toISOString())
    .not("body", "is", null)
    .select("id");
  if (others.error) throw others.error;

  return crisis.data.length + others.data.length;
}

type CorrespondenceActivityRow = {
  id: string;
  created_at: string;
  letters: { status: string; created_at: string; delivered_at: string | null }[];
};

// The most recent sign of life: the correspondence being opened, a letter being written,
// or a letter being delivered (delivery starts the other side's turn).
function lastActivity(row: CorrespondenceActivityRow): number {
  const times = [row.created_at, ...row.letters.flatMap((letter) => [letter.created_at, letter.delivered_at])]
    .filter((time): time is string => time !== null)
    .map((time) => Date.parse(time));
  return Math.max(...times);
}

// Closes open correspondences with no activity for 60 days. Only correspondences opened
// before the cutoff can qualify, so those are the only ones loaded. closed_at is never
// overwritten.
export async function closeInactiveCorrespondences(now: Date = new Date()): Promise<number> {
  const cutoff = daysBefore(now, CORRESPONDENCE_INACTIVITY_DAYS);

  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("id, created_at, letters(status, created_at, delivered_at)")
    .is("closed_at", null)
    .lt("created_at", cutoff.toISOString());
  if (error) throw error;

  const inactiveIds = (data as CorrespondenceActivityRow[])
    .filter((row) => !row.letters.some((letter) => letter.status === "held"))
    .filter((row) => lastActivity(row) < cutoff.getTime())
    .map((row) => row.id);
  if (inactiveIds.length === 0) return 0;

  const closed = await supabaseAdmin
    .from("correspondences")
    .update({ closed_at: now.toISOString() })
    .in("id", inactiveIds)
    .is("closed_at", null)
    .select("id");
  if (closed.error) throw closed.error;

  return closed.data.length;
}

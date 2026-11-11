import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { canSendLetter, type Correspondence, type Letter, type LetterSender } from "@/lib/letter-lifecycle";
import { checkLetterSafety, type LetterSafetyOutcome } from "@/lib/letter-safety";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";
import type { ContactInfoKind } from "@/lib/safety/contact-info";

// ADR-004 #210, part C: submitting a letter. Ties the correspondence rules (part B) to the
// safety pipeline and the database. Who the sender is (session or return key), rate
// limiting and the maximum length are checked by the API route (#211) before this runs.

// Partial unique index from 20261110003100: at most one held letter per correspondence.
const ONE_HELD_LETTER_INDEX = "letters_one_held_per_correspondence";
const UNIQUE_VIOLATION = "23505";

export type SubmitLetterResult =
  | { type: "held" } // waiting for the founder's review (up to 48h)
  | { type: "crisis"; resourceUrl: string } // not delivered; show help resources
  | { type: "rejected"; reason: "moderation" }
  | { type: "rejected"; reason: "contact_info"; contactKinds: ContactInfoKind[] } // so the sender knows what to remove
  | { type: "not_allowed"; reason: "closed" | "awaiting_review" | "not_your_turn" }
  | { type: "not_found" };

type SubmitLetterInput = {
  correspondenceId: string;
  sender: LetterSender;
  body: string;
};

async function loadCorrespondence(correspondenceId: string): Promise<Correspondence | null> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("closed_at, letters(sender, status)")
    .eq("id", correspondenceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // sender/status values are guaranteed by the letters table's check constraints.
  return { closedAt: data.closed_at, letters: data.letters as Letter[] };
}

type LetterRow = {
  correspondence_id: string;
  sender: LetterSender;
  status: "held" | "rejected";
  body: string | null;
  rejection_reason?: "crisis" | "moderation" | "contact_info";
};

// The row each safety outcome stores. Contact-info rejections never keep their text
// (it holds personal data); the database enforces that too.
function letterRow(input: SubmitLetterInput, safety: LetterSafetyOutcome): LetterRow {
  const base = { correspondence_id: input.correspondenceId, sender: input.sender };

  if (safety.outcome === "held") return { ...base, status: "held", body: input.body };

  return {
    ...base,
    status: "rejected",
    rejection_reason: safety.reason,
    body: safety.reason === "contact_info" ? null : input.body,
  };
}

function toResult(safety: LetterSafetyOutcome): SubmitLetterResult {
  if (safety.outcome === "held") return { type: "held" };
  if (safety.reason === "crisis") return { type: "crisis", resourceUrl: CRISIS_RESOURCE_URL };
  if (safety.reason === "contact_info") {
    return { type: "rejected", reason: "contact_info", contactKinds: safety.contactKinds };
  }
  return { type: "rejected", reason: "moderation" };
}

export async function submitLetter(input: SubmitLetterInput): Promise<SubmitLetterResult> {
  const correspondence = await loadCorrespondence(input.correspondenceId);
  if (!correspondence) return { type: "not_found" };

  // Checked before moderation, so a letter that can't be sent never costs an API call.
  const check = canSendLetter(correspondence, input.sender);
  if (!check.ok) return { type: "not_allowed", reason: check.reason };

  const safety = await checkLetterSafety(input.body);

  const { error } = await supabaseAdmin.from("letters").insert(letterRow(input, safety));
  if (error) {
    // Expected, not a bug: two submissions raced past canSendLetter during moderation
    // (double click, two tabs) and the index let only the first one in. Same answer
    // canSendLetter would now give. Any other error, unique violations included, throws.
    if (error.code === UNIQUE_VIOLATION && error.message.includes(ONE_HELD_LETTER_INDEX)) {
      return { type: "not_allowed", reason: "awaiting_review" };
    }
    throw error;
  }

  return toResult(safety);
}

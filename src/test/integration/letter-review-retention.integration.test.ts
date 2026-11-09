// Runs against a real local Postgres (npm run test:integration). Covers the constraints
// added for ADR-004's letter rules (20261109190000_add_letter_review_and_retention.sql).
// They're the last line of defense if application code gets a rule wrong, so each one is
// proven here, and each rejection is checked against the constraint that should fire.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

let identityIds: string[] = [];
let phraseIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  identityIds = [];
});

async function createCorrespondence(): Promise<string> {
  const identity = await supabaseAdmin.from("identities").insert({}).select("id").single();
  if (identity.error) throw identity.error;
  identityIds.push(identity.data.id);

  const phrase = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: "user",
      active: false,
      origin: LEAVE_A_TRACE_ORIGIN,
      moderation_status: "approved",
    })
    .select("id")
    .single();
  if (phrase.error) throw phrase.error;
  phraseIds.push(phrase.data.id);

  const correspondence = await supabaseAdmin
    .from("correspondences")
    .insert({ phrase_id: phrase.data.id, visitor_identity_id: identity.data.id })
    .select("id")
    .single();
  if (correspondence.error) throw correspondence.error;
  return correspondence.data.id;
}

type LetterFields = {
  body: string | null;
  status: string;
  rejection_reason?: string | null;
  anonymized_at?: string | null;
};

async function insertLetter(correspondenceId: string, fields: LetterFields) {
  return supabaseAdmin
    .from("letters")
    .insert({ correspondence_id: correspondenceId, sender: "visitor", ...fields })
    .select("id")
    .single();
}

describe("letters: review and retention rules (integration)", () => {
  it.each<[string, LetterFields, string]>([
    [
      "a rejected letter without a reason",
      { body: "hola", status: "rejected" },
      "letters_rejection_reason_matches_status",
    ],
    [
      "a reason on a letter that isn't rejected",
      { body: "hola", status: "held", rejection_reason: "crisis" },
      "letters_rejection_reason_matches_status",
    ],
    [
      "an unknown rejection reason",
      { body: "hola", status: "rejected", rejection_reason: "spam" },
      "letters_rejection_reason_check",
    ],
    [
      "a contact-info rejection that keeps its text",
      { body: "llámame al 55 1234 5678", status: "rejected", rejection_reason: "contact_info" },
      "letters_contact_info_body_not_stored",
    ],
    [
      // The three-valued-logic case: rejection_reason is null here, so a plain "=" in the
      // constraint would yield null and let this through.
      "a missing text with no explanation",
      { body: null, status: "held" },
      "letters_body_null_explained",
    ],
    [
      "a missing text on a review rejection",
      { body: null, status: "rejected", rejection_reason: "review" },
      "letters_body_null_explained",
    ],
  ])("rejects %s", async (_label, fields, constraint) => {
    const { error } = await insertLetter(await createCorrespondence(), fields);

    expect(error?.message).toContain(constraint);
  });

  it.each<[string, LetterFields]>([
    ["a held letter with text", { body: "hola", status: "held" }],
    ["a crisis rejection with text (kept 30 days)", { body: "hola", status: "rejected", rejection_reason: "crisis" }],
    ["a moderation rejection with text", { body: "hola", status: "rejected", rejection_reason: "moderation" }],
    ["a review rejection with text", { body: "hola", status: "rejected", rejection_reason: "review" }],
    ["a contact-info rejection without text", { body: null, status: "rejected", rejection_reason: "contact_info" }],
    ["an anonymized delivered letter", { body: null, status: "delivered", anonymized_at: new Date().toISOString() }],
  ])("accepts %s", async (_label, fields) => {
    const { error } = await insertLetter(await createCorrespondence(), fields);

    expect(error).toBeNull();
  });

  it("lets the retention job anonymize an existing letter", async () => {
    const { data, error } = await insertLetter(await createCorrespondence(), { body: "hola", status: "delivered" });
    if (error) throw error;

    const update = await supabaseAdmin
      .from("letters")
      .update({ body: null, anonymized_at: new Date().toISOString() })
      .eq("id", data.id);

    expect(update.error).toBeNull();
  });

  it("won't let a held letter be rejected for contact info without erasing its text", async () => {
    const { data, error } = await insertLetter(await createCorrespondence(), { body: "mi insta es juanito_99", status: "held" });
    if (error) throw error;

    const update = await supabaseAdmin
      .from("letters")
      .update({ status: "rejected", rejection_reason: "contact_info" })
      .eq("id", data.id);

    expect(update.error?.message).toContain("letters_contact_info_body_not_stored");
  });
});

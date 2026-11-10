// Runs against a real local Postgres (npm run test:integration). Covers the partial unique
// index letters_one_held_per_correspondence (20261110003100): at most one letter waiting
// for review per correspondence. It exists to close a check-then-act race in submitLetter,
// so besides the plain cases, one test fires concurrent inserts through PostgREST.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

const INDEX_NAME = "letters_one_held_per_correspondence";
const UNIQUE_VIOLATION = "23505";

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

type LetterStatus = "held" | "delivered" | "rejected";

async function insertLetter(correspondenceId: string, status: LetterStatus, sender = "visitor") {
  return supabaseAdmin
    .from("letters")
    .insert({
      correspondence_id: correspondenceId,
      sender,
      body: "hola",
      status,
      rejection_reason: status === "rejected" ? "review" : null,
    })
    .select("id")
    .single();
}

describe("letters: one held letter per correspondence (integration)", () => {
  it("rejects a second held letter in the same correspondence, by this index", async () => {
    const correspondenceId = await createCorrespondence();
    await insertLetter(correspondenceId, "held");

    const { error } = await insertLetter(correspondenceId, "held");

    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(error?.message).toContain(INDEX_NAME);
  });

  it("allows a held letter in each of two correspondences", async () => {
    const first = await insertLetter(await createCorrespondence(), "held");
    const second = await insertLetter(await createCorrespondence(), "held");

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
  });

  it.each<LetterStatus>(["delivered", "rejected"])("allows a %s letter next to a held one", async (status) => {
    const correspondenceId = await createCorrespondence();
    await insertLetter(correspondenceId, "held");

    const { error } = await insertLetter(correspondenceId, status);

    expect(error).toBeNull();
  });

  it("allows the next held letter once the previous one is delivered", async () => {
    const correspondenceId = await createCorrespondence();
    const held = await insertLetter(correspondenceId, "held");
    if (held.error) throw held.error;

    await supabaseAdmin
      .from("letters")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", held.data.id);
    const { error } = await insertLetter(correspondenceId, "held", "author");

    expect(error).toBeNull();
  });

  it("rejects moving a letter back to held while another one is held", async () => {
    const correspondenceId = await createCorrespondence();
    const delivered = await insertLetter(correspondenceId, "delivered");
    if (delivered.error) throw delivered.error;
    await insertLetter(correspondenceId, "held", "author");

    const { error } = await supabaseAdmin.from("letters").update({ status: "held" }).eq("id", delivered.data.id);

    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  // The race this index exists for: several submissions arrive at once (double click,
  // several tabs). Exactly one may win; every other one must fail with this index.
  it("lets exactly one of several concurrent held inserts through", async () => {
    const correspondenceId = await createCorrespondence();

    const results = await Promise.all(Array.from({ length: 5 }, () => insertLetter(correspondenceId, "held")));

    const succeeded = results.filter((result) => result.error === null);
    const failed = results.filter((result) => result.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(4);
    for (const { error } of failed) {
      expect(error?.code).toBe(UNIQUE_VIOLATION);
      expect(error?.message).toContain(INDEX_NAME);
    }

    const { count } = await supabaseAdmin
      .from("letters")
      .select("id", { count: "exact", head: true })
      .eq("correspondence_id", correspondenceId)
      .eq("status", "held");
    expect(count).toBe(1);
  });
});

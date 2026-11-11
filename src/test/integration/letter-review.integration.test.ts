// Runs against a real local Postgres (npm run test:integration). letter-review.test.ts
// mocks the database, so it can't prove what only a real one can: that the nested select
// (letter → correspondence → phrase + letters) works through PostgREST, that the
// "only if still held" update really makes concurrent decisions harmless, and that the
// 6th delivered letter closes the correspondence.
import { afterEach, describe, expect, it } from "vitest";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import {
  approveLetter,
  countLettersAwaitingReview,
  listLettersAwaitingReview,
  rejectLetter,
} from "@/lib/letter-review";
import { supabaseAdmin } from "@/lib/supabase";

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

async function insertLetter(
  correspondenceId: string,
  sender: "visitor" | "author",
  status: "held" | "delivered",
  body: string
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .insert({
      correspondence_id: correspondenceId,
      sender,
      status,
      body,
      delivered_at: status === "delivered" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function letterStatus(letterId: string) {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("status, rejection_reason, delivered_at")
    .eq("id", letterId)
    .single();
  if (error) throw error;
  return data;
}

async function closedAt(correspondenceId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("correspondences").select("closed_at").eq("id", correspondenceId).single();
  if (error) throw error;
  return data.closed_at;
}

describe("letter review (integration)", () => {
  it("lists a held letter with its phrase and the letters already delivered", async () => {
    const correspondenceId = await createCorrespondence();
    await insertLetter(correspondenceId, "visitor", "delivered", "Gracias por tu frase.");
    const heldId = await insertLetter(correspondenceId, "author", "held", "Gracias a ti.");

    const queue = await listLettersAwaitingReview();
    const entry = queue.find((letter) => letter.id === heldId);

    expect(entry).toEqual({
      id: heldId,
      sender: "author",
      body: "Gracias a ti.",
      createdAt: expect.any(String),
      phraseText: realPhraseFixtures[1].text,
      deliveredLetters: [{ sender: "visitor", body: "Gracias por tu frase.", deliveredAt: expect.any(String) }],
    });
    expect(await countLettersAwaitingReview()).toBeGreaterThanOrEqual(1);
  });

  it("approving delivers the letter and takes it out of the queue", async () => {
    const heldId = await insertLetter(await createCorrespondence(), "visitor", "held", "hola");

    expect(await approveLetter(heldId)).toEqual({ ok: true });
    expect(await letterStatus(heldId)).toEqual({ status: "delivered", rejection_reason: null, delivered_at: expect.any(String) });
    expect((await listLettersAwaitingReview()).some((letter) => letter.id === heldId)).toBe(false);
  });

  it("rejecting stores reason 'review' and passes the real constraints", async () => {
    const heldId = await insertLetter(await createCorrespondence(), "visitor", "held", "hola");

    expect(await rejectLetter(heldId)).toEqual({ ok: true });
    expect(await letterStatus(heldId)).toEqual({ status: "rejected", rejection_reason: "review", delivered_at: null });
  });

  it("a decision on an already-decided letter changes nothing", async () => {
    const heldId = await insertLetter(await createCorrespondence(), "visitor", "held", "hola");
    await approveLetter(heldId);

    expect(await rejectLetter(heldId)).toEqual({ ok: false, reason: "already_decided" });
    expect((await letterStatus(heldId)).status).toBe("delivered");
  });

  // Double click or two open tabs: only one decision may take effect.
  it("lets exactly one of several concurrent decisions through", async () => {
    const heldId = await insertLetter(await createCorrespondence(), "visitor", "held", "hola");

    const results = await Promise.all([approveLetter(heldId), approveLetter(heldId), rejectLetter(heldId)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "already_decided" },
      { ok: false, reason: "already_decided" },
    ]);
  });

  it("approving the 6th letter closes the correspondence; earlier ones don't", async () => {
    const correspondenceId = await createCorrespondence();
    for (const sender of ["visitor", "author", "visitor", "author", "visitor"] as const) {
      await insertLetter(correspondenceId, sender, "delivered", "carta");
    }
    const sixthId = await insertLetter(correspondenceId, "author", "held", "última carta");

    expect(await closedAt(correspondenceId)).toBeNull();
    await approveLetter(sixthId);

    expect(await closedAt(correspondenceId)).not.toBeNull();
  });
});

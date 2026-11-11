// Runs against a real local Postgres (npm run test:integration). letter-retention.test.ts
// mocks the database, so it only proves which filters are called, not that PostgREST
// applies them as intended (the "or" on a nullable rejection_reason, "not body is null").
// Rows are dated in the past and the job runs with an explicit `now`, so each boundary
// (29 vs 31 days, 59 vs 61) is tested on real data.
import { afterEach, describe, expect, it } from "vitest";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { anonymizeExpiredLetters, closeInactiveCorrespondences } from "@/lib/letter-retention";
import { supabaseAdmin } from "@/lib/supabase";

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let identityIds: string[] = [];
let phraseIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  identityIds = [];
});

async function createCorrespondence(createdDaysAgo = 0): Promise<string> {
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
    .insert({ phrase_id: phrase.data.id, visitor_identity_id: identity.data.id, created_at: daysAgo(createdDaysAgo) })
    .select("id")
    .single();
  if (correspondence.error) throw correspondence.error;
  return correspondence.data.id;
}

type LetterSeed = {
  status: "held" | "delivered" | "rejected";
  reason?: "crisis" | "moderation" | "contact_info" | "review";
  createdDaysAgo: number;
  deliveredDaysAgo?: number;
};

async function insertLetter(correspondenceId: string, seed: LetterSeed): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .insert({
      correspondence_id: correspondenceId,
      sender: "visitor",
      status: seed.status,
      rejection_reason: seed.reason ?? null,
      body: seed.reason === "contact_info" ? null : "texto de prueba",
      created_at: daysAgo(seed.createdDaysAgo),
      delivered_at: seed.status === "delivered" ? daysAgo(seed.deliveredDaysAgo ?? seed.createdDaysAgo) : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function letterState(letterId: string) {
  const { data, error } = await supabaseAdmin.from("letters").select("body, anonymized_at").eq("id", letterId).single();
  if (error) throw error;
  return { erased: data.body === null && data.anonymized_at !== null, untouched: data.anonymized_at === null };
}

async function isClosed(correspondenceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("correspondences").select("closed_at").eq("id", correspondenceId).single();
  if (error) throw error;
  return data.closed_at !== null;
}

describe("anonymizeExpiredLetters (integration)", () => {
  it("erases text exactly at each retention boundary and leaves held letters alone", async () => {
    const correspondenceId = await createCorrespondence(90);
    const letters = {
      crisis31: await insertLetter(correspondenceId, { status: "rejected", reason: "crisis", createdDaysAgo: 31 }),
      crisis29: await insertLetter(correspondenceId, { status: "rejected", reason: "crisis", createdDaysAgo: 29 }),
      delivered61: await insertLetter(correspondenceId, { status: "delivered", createdDaysAgo: 61 }),
      delivered59: await insertLetter(correspondenceId, { status: "delivered", createdDaysAgo: 59 }),
      moderation61: await insertLetter(correspondenceId, { status: "rejected", reason: "moderation", createdDaysAgo: 61 }),
      review61: await insertLetter(correspondenceId, { status: "rejected", reason: "review", createdDaysAgo: 61 }),
      held61: await insertLetter(correspondenceId, { status: "held", createdDaysAgo: 61 }),
      contactInfo61: await insertLetter(correspondenceId, { status: "rejected", reason: "contact_info", createdDaysAgo: 61 }),
    };

    const count = await anonymizeExpiredLetters(NOW);

    expect(count).toBe(4); // crisis31, delivered61, moderation61, review61
    expect(await letterState(letters.crisis31)).toEqual({ erased: true, untouched: false });
    expect(await letterState(letters.delivered61)).toEqual({ erased: true, untouched: false });
    expect(await letterState(letters.moderation61)).toEqual({ erased: true, untouched: false });
    expect(await letterState(letters.review61)).toEqual({ erased: true, untouched: false });
    expect((await letterState(letters.crisis29)).untouched).toBe(true);
    expect((await letterState(letters.delivered59)).untouched).toBe(true);
    expect((await letterState(letters.held61)).untouched).toBe(true); // waits for review
    expect((await letterState(letters.contactInfo61)).untouched).toBe(true); // never had text
  });

  it("changes nothing when run a second time", async () => {
    const correspondenceId = await createCorrespondence(90);
    await insertLetter(correspondenceId, { status: "delivered", createdDaysAgo: 61 });
    await anonymizeExpiredLetters(NOW);

    expect(await anonymizeExpiredLetters(NOW)).toBe(0);
  });
});

describe("closeInactiveCorrespondences (integration)", () => {
  it("closes only correspondences with no activity for 60 days and nothing held", async () => {
    const noLetters = await createCorrespondence(61);
    const tooYoung = await createCorrespondence(59);
    const allOld = await createCorrespondence(90);
    await insertLetter(allOld, { status: "delivered", createdDaysAgo: 80, deliveredDaysAgo: 79 });
    const recentLetter = await createCorrespondence(90);
    await insertLetter(recentLetter, { status: "rejected", reason: "review", createdDaysAgo: 10 });
    const recentDelivery = await createCorrespondence(90);
    await insertLetter(recentDelivery, { status: "delivered", createdDaysAgo: 61, deliveredDaysAgo: 59 });
    const oldHeld = await createCorrespondence(90);
    await insertLetter(oldHeld, { status: "held", createdDaysAgo: 70 });

    expect(await closeInactiveCorrespondences(NOW)).toBe(2);
    expect(await isClosed(noLetters)).toBe(true);
    expect(await isClosed(allOld)).toBe(true);
    expect(await isClosed(tooYoung)).toBe(false);
    expect(await isClosed(recentLetter)).toBe(false);
    expect(await isClosed(recentDelivery)).toBe(false);
    expect(await isClosed(oldHeld)).toBe(false); // approving it would deliver into a closed correspondence
  });

  it("never overwrites an earlier closed_at, and a second run closes nothing", async () => {
    const correspondenceId = await createCorrespondence(90);
    const earlier = daysAgo(30);
    await supabaseAdmin.from("correspondences").update({ closed_at: earlier }).eq("id", correspondenceId);

    expect(await closeInactiveCorrespondences(NOW)).toBe(0);
    const { data } = await supabaseAdmin.from("correspondences").select("closed_at").eq("id", correspondenceId).single();
    expect(Date.parse(data!.closed_at)).toBe(Date.parse(earlier));
  });
});

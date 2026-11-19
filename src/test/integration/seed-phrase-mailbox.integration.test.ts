// Runs against a real local Postgres (npm run test:integration). The founder's side of
// seed-phrase correspondences, end to end, mocking only the OpenAI moderation call:
// getSeedPhraseMailbox's phrases!inner filters against real PostgREST, and
// submitSeedPhraseLetter through the real pipeline and the founder's own review.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { startCorrespondence, submitLetterWithReturnKey, submitSeedPhraseLetter } from "@/lib/correspondences";
import { confirmReturnKey, createIdentityWithReturnKey } from "@/lib/identity-keys";
import { approveLetter } from "@/lib/letter-review";
import { getMailboxWithReturnKey, getSeedPhraseMailbox, type MailboxCorrespondence } from "@/lib/mailbox";
import { createResponse } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { keepVisitorSeal } from "./keep-visitor-seal";

let phraseIds: string[] = [];
let entryIds: string[] = [];
let identityIds: string[] = [];

beforeEach(() => {
  moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
});

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (entryIds.length > 0) await supabaseAdmin.from("entries").delete().in("id", entryIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  entryIds = [];
  identityIds = [];
  vi.resetAllMocks();
});

// Already confirmed, as an author's key always is before their phrase accepts letters (#212).
async function createIdentity() {
  const identity = await createIdentityWithReturnKey();
  identityIds.push(identity.identityId);
  await confirmReturnKey(identity.returnKey);
  return identity;
}

async function createPhrase(source: "seed" | "user", authorIdentityId: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source,
      origin: source === "user" ? LEAVE_A_TRACE_ORIGIN : null,
      active: true,
      moderation_status: "approved",
      identity_id: authorIdentityId,
    })
    .select("id")
    .single();
  if (error) throw error;
  phraseIds.push(data.id);
  return data.id;
}

// A visitor whose entry matched the phrase starts a correspondence with `firstLetter`.
async function startWith(phraseId: string, firstLetter: string) {
  const session = randomUUID();
  const { data: entry, error } = await supabaseAdmin
    .from("entries")
    .insert({ text: "un dia normal", flagged_crisis: false, flagged_general: false, matched_phrase_id: phraseId })
    .select("id")
    .single();
  if (error) throw error;
  entryIds.push(entry.id);
  await createResponse(entry.id, session);

  const visitor = await keepVisitorSeal(entry.id, session);
  identityIds.push(visitor.identityId);
  const result = await startCorrespondence({
    entryId: entry.id,
    sessionId: session,
    returnKey: visitor.returnKey,
    body: firstLetter,
  });
  if (result.type !== "started") throw new Error(`expected started, got ${result.type}`);
  const { data: correspondence } = await supabaseAdmin
    .from("correspondences")
    .select("visitor_identity_id")
    .eq("id", result.correspondenceId)
    .single();
  identityIds.push(correspondence!.visitor_identity_id);
  return { correspondenceId: result.correspondenceId, visitorKey: visitor.returnKey };
}

async function approveHeldLetter(correspondenceId: string) {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("id")
    .eq("correspondence_id", correspondenceId)
    .eq("status", "held")
    .single();
  if (error) throw error;
  await approveLetter(data.id);
}

async function lettersOf(correspondenceId: string) {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("sender, status")
    .eq("correspondence_id", correspondenceId)
    .order("created_at");
  if (error) throw error;
  return data;
}

// Only this test's correspondences: the local database is shared with other test files.
async function founderSees(correspondenceId: string): Promise<MailboxCorrespondence | undefined> {
  return (await getSeedPhraseMailbox()).correspondences.find(({ id }) => id === correspondenceId);
}

describe("the founder's seed-phrase mailbox (integration)", () => {
  it("lets the founder answer a seed phrase through the same review, until the correspondence closes", async () => {
    const { correspondenceId, visitorKey } = await startWith(await createPhrase("seed", null), "Gracias por tu frase.");

    // Nothing has reached the founder as author yet (they see it in Letters, as reviewer).
    expect(await founderSees(correspondenceId)).toBeUndefined();

    for (let round = 1; round <= 3; round++) {
      await approveHeldLetter(correspondenceId); // the visitor's letter
      expect((await founderSees(correspondenceId))?.state).toBe("your_turn");

      expect(await submitSeedPhraseLetter({ correspondenceId, body: `Respuesta ${round}.` })).toEqual({ type: "held" });
      expect((await founderSees(correspondenceId))?.state).toBe("awaiting_review");
      expect((await getMailboxWithReturnKey(visitorKey))!.correspondences[0].state).toBe("their_turn");

      await approveHeldLetter(correspondenceId); // the founder's own letter
      if (round < 3) {
        await submitLetterWithReturnKey({ correspondenceId, returnKey: visitorKey, body: `Carta ${round + 1}.` });
      }
    }

    const visitorView = (await getMailboxWithReturnKey(visitorKey))!.correspondences[0];
    expect(visitorView.state).toBe("closed");
    expect(visitorView.letters.filter(({ sender }) => sender === "author").map(({ body }) => body)).toEqual([
      "Respuesta 1.",
      "Respuesta 2.",
      "Respuesta 3.",
    ]);
    expect((await founderSees(correspondenceId))?.state).toBe("closed");
    // The 6th delivery set closed_at, through approveLetter like every other delivery.
    const { data } = await supabaseAdmin.from("correspondences").select("closed_at").eq("id", correspondenceId).single();
    expect(data!.closed_at).not.toBeNull();
  });

  it.each([
    ["a user phrase with its own author", "user"],
    ["a seed phrase that has an author identity", "seed"],
  ] as const)("never shows, nor lets the founder write on, %s", async (_label, source) => {
    const author = await createIdentity();
    const { correspondenceId } = await startWith(await createPhrase(source, author.identityId), "Hola.");
    await approveHeldLetter(correspondenceId);
    const before = await lettersOf(correspondenceId);

    expect(await founderSees(correspondenceId)).toBeUndefined();
    expect(await submitSeedPhraseLetter({ correspondenceId, body: "Hola desde admin." })).toEqual({ type: "not_found" });
    expect(await lettersOf(correspondenceId)).toEqual(before);
  });

  it("answers not_found for a correspondence that doesn't exist", async () => {
    expect(await submitSeedPhraseLetter({ correspondenceId: randomUUID(), body: "Hola." })).toEqual({ type: "not_found" });
  });
});

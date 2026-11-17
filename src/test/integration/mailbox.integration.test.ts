// Runs against a real local Postgres (npm run test:integration). Exercises
// getMailboxWithReturnKey end to end, mocking only the OpenAI moderation call: a real
// return key resolves to its identity, PostgREST finds its correspondences as visitor and
// (through phrases!inner) as author, and the visibility rules apply to real rows written
// by startCorrespondence, submitLetterWithReturnKey and the founder's review.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { startCorrespondence, submitLetterWithReturnKey } from "@/lib/correspondences";
import { confirmReturnKey, createIdentityWithReturnKey, generateReturnKey } from "@/lib/identity-keys";
import { approveLetter, rejectLetter } from "@/lib/letter-review";
import { getMailboxWithReturnKey, type Mailbox } from "@/lib/mailbox";
import { createResponse } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

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

// A phrase by the given author identity, or a seed phrase (no author identity) for null.
async function createPhrase(authorIdentityId: string | null, text = realPhraseFixtures[1].text): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text,
      embedding: realPhraseFixtures[1].embedding,
      source: authorIdentityId ? "user" : "seed",
      origin: authorIdentityId ? LEAVE_A_TRACE_ORIGIN : null,
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

  const result = await startCorrespondence({ entryId: entry.id, sessionId: session, body: firstLetter });
  if (result.type !== "started") throw new Error(`expected started, got ${result.type}`);
  const { data: correspondence } = await supabaseAdmin
    .from("correspondences")
    .select("visitor_identity_id")
    .eq("id", result.correspondenceId)
    .single();
  identityIds.push(correspondence!.visitor_identity_id);
  return { correspondenceId: result.correspondenceId, visitorKey: result.returnKey };
}

async function heldLetterOf(correspondenceId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("id")
    .eq("correspondence_id", correspondenceId)
    .eq("status", "held")
    .single();
  if (error) throw error;
  return data.id;
}

async function mailboxOf(returnKey: string): Promise<Mailbox> {
  const mailbox = await getMailboxWithReturnKey(returnKey);
  if (!mailbox) throw new Error("expected the key to be recognized");
  return mailbox;
}

// What each side sees, in a form short enough to compare whole.
function summary(mailbox: Mailbox) {
  return mailbox.correspondences.map(({ yourSide, state, letters }) => ({
    yourSide,
    state,
    letters: letters.map(({ sender, status, body }) => [sender, status, body]),
  }));
}

describe("getMailboxWithReturnKey (integration)", () => {
  it("shows each side what has reached it, through a whole round of letters and a review rejection", async () => {
    const author = await createIdentity();
    const phraseId = await createPhrase(author.identityId);
    const { correspondenceId, visitorKey } = await startWith(phraseId, "Gracias por tu frase.");

    // 1. The visitor's first letter waits for review: only the visitor knows about it.
    expect(summary(await mailboxOf(visitorKey))).toEqual([
      { yourSide: "visitor", state: "awaiting_review", letters: [["visitor", "held", "Gracias por tu frase."]] },
    ]);
    expect(await mailboxOf(author.returnKey)).toEqual({ correspondences: [] });

    // 2. Delivered: it's the author's turn.
    await approveLetter(await heldLetterOf(correspondenceId));
    expect(summary(await mailboxOf(author.returnKey))).toEqual([
      { yourSide: "author", state: "your_turn", letters: [["visitor", "delivered", "Gracias por tu frase."]] },
    ]);
    expect((await mailboxOf(visitorKey)).correspondences[0].state).toBe("their_turn");

    // 3. The author's reply waits for review: the visitor doesn't hear of it.
    await submitLetterWithReturnKey({ correspondenceId, returnKey: author.returnKey, body: "Gracias a ti." });
    expect(summary(await mailboxOf(visitorKey))).toEqual([
      { yourSide: "visitor", state: "their_turn", letters: [["visitor", "delivered", "Gracias por tu frase."]] },
    ]);
    expect(summary(await mailboxOf(author.returnKey))).toEqual([
      {
        yourSide: "author",
        state: "awaiting_review",
        letters: [
          ["visitor", "delivered", "Gracias por tu frase."],
          ["author", "held", "Gracias a ti."],
        ],
      },
    ]);

    // 4. The founder rejects it: the author learns it here, with their text, and can rewrite.
    await rejectLetter(await heldLetterOf(correspondenceId));
    expect(summary(await mailboxOf(author.returnKey))).toEqual([
      {
        yourSide: "author",
        state: "your_turn",
        letters: [
          ["visitor", "delivered", "Gracias por tu frase."],
          ["author", "rejected", "Gracias a ti."],
        ],
      },
    ]);
    expect(summary(await mailboxOf(visitorKey))).toEqual([
      { yourSide: "visitor", state: "their_turn", letters: [["visitor", "delivered", "Gracias por tu frase."]] },
    ]);
  });

  it("gives the visitor their correspondence even when the first letter was rejected on sending", async () => {
    const { visitorKey } = await startWith(await createPhrase(null), "Escríbeme al 55 1234 5678");

    const mailbox = await mailboxOf(visitorKey);

    expect(summary(mailbox)).toEqual([{ yourSide: "visitor", state: "your_turn", letters: [] }]);
    expect(mailbox.correspondences[0].phraseText).toBe(realPhraseFixtures[1].text);
  });

  it("opens every correspondence on the author's phrases, and none on other authors' phrases", async () => {
    const author = await createIdentity();
    const otherAuthor = await createIdentity();
    const first = await startWith(await createPhrase(author.identityId, "primera frase"), "Hola, primera.");
    const second = await startWith(await createPhrase(author.identityId, "segunda frase"), "Hola, segunda.");
    const elsewhere = await startWith(await createPhrase(otherAuthor.identityId, "frase ajena"), "Hola, ajena.");
    for (const { correspondenceId } of [first, second, elsewhere]) {
      await approveLetter(await heldLetterOf(correspondenceId));
    }

    const { correspondences } = await mailboxOf(author.returnKey);

    // Newest first.
    expect(correspondences.map(({ id, phraseText }) => [id, phraseText])).toEqual([
      [second.correspondenceId, "segunda frase"],
      [first.correspondenceId, "primera frase"],
    ]);
  });

  it("opens a visitor key's own correspondence only, on a seed phrase too", async () => {
    const seedPhraseId = await createPhrase(null);
    const mine = await startWith(seedPhraseId, "Hola.");
    await startWith(seedPhraseId, "Hola también."); // another visitor, same phrase

    const { correspondences } = await mailboxOf(mine.visitorKey);

    expect(correspondences.map(({ id }) => id)).toEqual([mine.correspondenceId]);
  });

  it("returns an empty mailbox for a real key that takes part in nothing yet", async () => {
    const { returnKey } = await createIdentity();
    await startWith(await createPhrase(null), "Hola.");

    expect(await mailboxOf(returnKey)).toEqual({ correspondences: [] });
  });

  it("returns null for a key that was never issued", async () => {
    expect(await getMailboxWithReturnKey(generateReturnKey())).toBeNull();
  });
});

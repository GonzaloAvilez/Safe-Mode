// Runs against a real local Postgres (npm run test:integration). Exercises
// submitLetterWithReturnKey end to end, mocking only the OpenAI moderation call: a real
// return key resolves to its identity, the correspondence → phrase join decides which side
// is writing, and submitLetter's turn rules apply to that side.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { startCorrespondence, submitLetterWithReturnKey } from "@/lib/correspondences";
import { createIdentityWithReturnKey, generateReturnKey } from "@/lib/identity-keys";
import { approveLetter } from "@/lib/letter-review";
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

async function createIdentity() {
  const identity = await createIdentityWithReturnKey();
  identityIds.push(identity.identityId);
  return identity;
}

// A phrase, plus its author's key when the author opted in (a seed phrase has none).
async function createPhrase(kind: "seed" | "user with author"): Promise<{ phraseId: string; authorKey: string | null }> {
  const author = kind === "user with author" ? await createIdentity() : null;
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: kind === "seed" ? "seed" : "user",
      origin: kind === "seed" ? null : LEAVE_A_TRACE_ORIGIN,
      active: true,
      moderation_status: "approved",
      identity_id: author?.identityId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  phraseIds.push(data.id);
  return { phraseId: data.id, authorKey: author?.returnKey ?? null };
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

async function lettersOf(correspondenceId: string) {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("id, sender, status")
    .eq("correspondence_id", correspondenceId)
    .order("created_at");
  if (error) throw error;
  return data;
}

describe("submitLetterWithReturnKey (integration)", () => {
  it("lets the author reply with their key once the visitor's letter is delivered", async () => {
    const { phraseId, authorKey } = await createPhrase("user with author");
    const { correspondenceId } = await startWith(phraseId, "Gracias por tu frase.");
    const [visitorLetter] = await lettersOf(correspondenceId);
    await approveLetter(visitorLetter.id);

    const result = await submitLetterWithReturnKey({ correspondenceId, returnKey: authorKey!, body: "Gracias a ti." });

    expect(result).toEqual({ type: "held" });
    expect((await lettersOf(correspondenceId)).map(({ sender, status }) => [sender, status])).toEqual([
      ["visitor", "delivered"],
      ["author", "held"],
    ]);
  });

  it("recognizes the author's key before it's their turn (awaiting review, not not_found)", async () => {
    const { phraseId, authorKey } = await createPhrase("user with author");
    const { correspondenceId } = await startWith(phraseId, "Gracias por tu frase.");

    const result = await submitLetterWithReturnKey({ correspondenceId, returnKey: authorKey!, body: "Gracias a ti." });

    expect(result).toEqual({ type: "not_allowed", reason: "awaiting_review" });
  });

  it("lets the visitor retry with their key after a rejected first letter", async () => {
    const { phraseId } = await createPhrase("seed");
    const { correspondenceId, visitorKey } = await startWith(phraseId, "Escríbeme al 55 1234 5678");

    const result = await submitLetterWithReturnKey({ correspondenceId, returnKey: visitorKey, body: "Gracias por tu frase." });

    expect(result).toEqual({ type: "held" });
    expect((await lettersOf(correspondenceId)).map(({ sender, status }) => [sender, status])).toEqual([
      ["visitor", "rejected"],
      ["visitor", "held"],
    ]);
  });

  it.each([
    ["a key that was never issued", async () => generateReturnKey()],
    ["the visitor key of another correspondence", async () => (await startWith((await createPhrase("seed")).phraseId, "Hola")).visitorKey],
    ["any other real key, on a seed phrase (no author identity)", async () => (await createIdentity()).returnKey],
  ])("answers not_found and writes nothing for %s", async (_label, makeKey) => {
    const { phraseId } = await createPhrase("seed");
    const { correspondenceId } = await startWith(phraseId, "Escríbeme al 55 1234 5678"); // rejected: visitor's turn again
    const returnKey = await makeKey();
    const before = await lettersOf(correspondenceId);

    const result = await submitLetterWithReturnKey({ correspondenceId, returnKey, body: "Hola de nuevo." });

    expect(result).toEqual({ type: "not_found" });
    expect(await lettersOf(correspondenceId)).toEqual(before);
  });

  it("answers not_found for a correspondence that doesn't exist", async () => {
    const { returnKey } = await createIdentity();

    expect(await submitLetterWithReturnKey({ correspondenceId: randomUUID(), returnKey, body: "Hola." })).toEqual({
      type: "not_found",
    });
  });
});

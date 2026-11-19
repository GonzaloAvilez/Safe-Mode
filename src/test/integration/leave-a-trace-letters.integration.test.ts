// Runs against a real local Postgres (npm run test:integration), with the
// RETURN_KEY_HASH_SECRET that run-integration-tests.sh exports. ADR-004 #212: a Leave a Trace
// author who accepts letters, end to end: what gets stored, that the key really is the
// author's, that letters wait until the author confirms the key, and that a phrase that
// can't be stored leaves no identity behind. Only the OpenAI moderation call is mocked.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { createVisitorReturnKey, startCorrespondence } from "@/lib/correspondences";
import { confirmReturnKey, resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import { submitUserPhraseAcceptingLetters } from "@/lib/phrases";
import { createResponse } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { keepVisitorSeal } from "./keep-visitor-seal";

const PHRASE = "Lo que no dije también pesa.";

let phraseIds: string[] = [];
let entryIds: string[] = [];
let identityIds: string[] = [];

afterEach(async () => {
  // Phrases first: deleting one cascades to its correspondences and their letters.
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (entryIds.length > 0) await supabaseAdmin.from("entries").delete().in("id", entryIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  entryIds = [];
  identityIds = [];
  vi.resetAllMocks();
});

async function leaveTraceAcceptingLetters() {
  const { id, returnKey } = await submitUserPhraseAcceptingLetters(PHRASE, "es");
  phraseIds.push(id);
  const { data, error } = await supabaseAdmin.from("phrases").select("*").eq("id", id).single();
  if (error) throw error;
  identityIds.push(data.identity_id);
  return { phrase: data, returnKey };
}

// An entry written by `sessionId` that matched `phraseId`, as submitEntry leaves it.
async function createMatchedEntry(sessionId: string, phraseId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("entries")
    .insert({ text: "un dia normal", flagged_crisis: false, flagged_general: false, matched_phrase_id: phraseId })
    .select("id")
    .single();
  if (error) throw error;
  entryIds.push(data.id);
  await createResponse(data.id, sessionId);
  return data.id;
}

async function countIdentities(): Promise<number> {
  const { count, error } = await supabaseAdmin.from("identities").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

describe("a Leave a Trace author who accepts letters (integration)", () => {
  it("stores the phrase as the author's, waiting for moderation like any other, and the key is the author's", async () => {
    const { phrase, returnKey } = await leaveTraceAcceptingLetters();

    expect(phrase).toMatchObject({
      text: PHRASE,
      origin: LEAVE_A_TRACE_ORIGIN,
      source: "user",
      language: "es",
      moderation_status: "pending",
      active: false,
    });
    expect(phrase.identity_id).not.toBeNull();
    expect(await resolveIdentityFromReturnKey(returnKey)).toBe(phrase.identity_id);
    expect(JSON.stringify(phrase)).not.toContain(returnKey);
  });

  it("accepts letters only once the author confirms the key", async () => {
    const { phrase, returnKey } = await leaveTraceAcceptingLetters();
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, phrase.id);
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    // Before the author confirms, a visitor can't even ask for a seal to write with.
    expect(await createVisitorReturnKey({ entryId, sessionId: session })).toEqual({ type: "phrase_not_connectable" });

    expect(await confirmReturnKey(returnKey)).toBe(true);
    const visitor = await keepVisitorSeal(entryId, session);
    identityIds.push(visitor.identityId);
    const afterConfirming = await startCorrespondence({
      entryId,
      sessionId: session,
      returnKey: visitor.returnKey,
      body: "Gracias por tu frase.",
    });

    if (afterConfirming.type !== "started") throw new Error(`expected started, got ${afterConfirming.type}`);
    expect(afterConfirming.letter).toEqual({ type: "held" });
  });

  it("leaves no identity behind when the phrase can't be stored", async () => {
    const before = await countIdentities();

    // phrases.text is NOT NULL, so Postgres itself rejects the insert after the identity exists.
    await expect(submitUserPhraseAcceptingLetters(null as unknown as string, "es")).rejects.toBeTruthy();

    expect(await countIdentities()).toBe(before);
  });
});

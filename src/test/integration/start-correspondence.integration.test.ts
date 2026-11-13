// Runs against a real local Postgres (npm run test:integration). Exercises
// startCorrespondence end to end, mocking only the OpenAI moderation call: the nested
// ownership lookup (responses → entries → phrases) through PostgREST, the key handoff
// (the returned key really resolves to the visitor of the new correspondence), and the
// cleanup when the first letter can't be stored.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { startCorrespondence } from "@/lib/correspondences";
import { resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import { createResponse } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

// The session writing the entries in the refusal cases below.
const SESSION = randomUUID();

let phraseIds: string[] = [];
let entryIds: string[] = [];
let identityIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (entryIds.length > 0) await supabaseAdmin.from("entries").delete().in("id", entryIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  entryIds = [];
  identityIds = [];
  vi.resetAllMocks();
});

async function createPhrase(kind: "seed" | "user without author" | "user with author"): Promise<string> {
  let identityId: string | null = null;
  if (kind === "user with author") {
    const identity = await supabaseAdmin.from("identities").insert({}).select("id").single();
    if (identity.error) throw identity.error;
    identityId = identity.data.id;
    identityIds.push(identity.data.id);
  }
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: kind === "seed" ? "seed" : "user",
      origin: kind === "seed" ? null : LEAVE_A_TRACE_ORIGIN,
      active: true,
      moderation_status: "approved",
      identity_id: identityId,
    })
    .select("id")
    .single();
  if (error) throw error;
  phraseIds.push(data.id);
  return data.id;
}

// An entry written by `sessionId` that matched `phraseId`, as submitEntry leaves it.
async function createMatchedEntry(sessionId: string, phraseId: string | null): Promise<string> {
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

async function countRows(table: "identities" | "correspondences" | "letters"): Promise<number> {
  const { count, error } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function trackVisitor(correspondenceId: string) {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("*")
    .eq("id", correspondenceId)
    .single();
  if (error) throw error;
  identityIds.push(data.visitor_identity_id);
  return data;
}

describe("startCorrespondence (integration)", () => {
  it("starts with a seed phrase: the key resolves to the new correspondence's visitor and the letter waits for review", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await startCorrespondence({ entryId, sessionId: session, body: "Gracias por tu frase." });

    if (result.type !== "started") throw new Error(`expected started, got ${result.type}`);
    expect(result.letter).toEqual({ type: "held" });
    const correspondence = await trackVisitor(result.correspondenceId);
    expect(await resolveIdentityFromReturnKey(result.returnKey)).toBe(correspondence.visitor_identity_id);
    // ADR-004 hard rule: nothing about the entry is stored with the correspondence.
    expect(Object.keys(correspondence).sort()).toEqual(["closed_at", "created_at", "id", "phrase_id", "visitor_identity_id"]);
  });

  it("starts with a phrase whose author opted in", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("user with author"));
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await startCorrespondence({ entryId, sessionId: session, body: "Gracias por tu frase." });

    expect(result.type).toBe("started");
    if (result.type === "started") await trackVisitor(result.correspondenceId);
  });

  it("starts even when the first letter is rejected, so the visitor can retry with the key", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await startCorrespondence({ entryId, sessionId: session, body: "Escríbeme al 55 1234 5678" });

    if (result.type !== "started") throw new Error(`expected started, got ${result.type}`);
    expect(result.letter).toEqual({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });
    await trackVisitor(result.correspondenceId);
    const { data } = await supabaseAdmin.from("letters").select("status, body").eq("correspondence_id", result.correspondenceId);
    expect(data).toEqual([{ status: "rejected", body: null }]);
  });

  it.each([
    ["another session's entry", async () => createMatchedEntry(randomUUID(), await createPhrase("seed")), { type: "entry_not_found" }],
    ["an entry that matched nothing", async () => createMatchedEntry(SESSION, null), { type: "entry_not_found" }],
    ["an unknown entry id", async () => randomUUID(), { type: "entry_not_found" }],
    [
      "a user phrase without an author",
      async () => createMatchedEntry(SESSION, await createPhrase("user without author")),
      { type: "phrase_not_connectable" },
    ],
  ])("refuses %s and creates nothing", async (_label, makeEntry, expected) => {
    const entryId = await makeEntry();
    const before = await Promise.all([countRows("identities"), countRows("correspondences")]);

    const result = await startCorrespondence({ entryId, sessionId: SESSION, body: "hola" });

    expect(result).toEqual(expected);
    expect(await Promise.all([countRows("identities"), countRows("correspondences")])).toEqual(before);
    expect(moderateTextMock).not.toHaveBeenCalled();
  });

  it("leaves no identity, correspondence or letter behind when moderation is unavailable", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    moderateTextMock.mockRejectedValue(new Error("OpenAI unavailable"));
    const before = await Promise.all([countRows("identities"), countRows("correspondences"), countRows("letters")]);

    await expect(startCorrespondence({ entryId, sessionId: session, body: "hola" })).rejects.toThrow("OpenAI unavailable");

    expect(await Promise.all([countRows("identities"), countRows("correspondences"), countRows("letters")])).toEqual(before);
  });
});

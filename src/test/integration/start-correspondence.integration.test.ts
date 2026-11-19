// Runs against a real local Postgres (npm run test:integration). Exercises the visitor's
// side of design B (#212) end to end, mocking only the OpenAI moderation call: asking for a
// seal (createVisitorReturnKey) and starting a correspondence with it once confirmed
// (startCorrespondence), through the nested ownership lookup (responses → entries → phrases),
// the unique (phrase, visitor) constraint, and the cleanup when the first letter can't be
// stored. Also isPhraseConnectableNow, which Mirror reads to offer a letter at all.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock, isLettersOpenMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn(), isLettersOpenMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));
// letters_open is a per-environment row that a fresh local database doesn't have (and
// defaults closed); isPhraseConnectableNow's own tests decide it here.
vi.mock("@/lib/settings", () => ({ isLettersOpen: isLettersOpenMock }));

import { createVisitorReturnKey, isPhraseConnectableNow, startCorrespondence } from "@/lib/correspondences";
import { confirmReturnKey, createIdentityWithReturnKey, resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import { getMailboxWithReturnKey } from "@/lib/mailbox";
import { createResponse } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { keepVisitorSeal } from "./keep-visitor-seal";

// The session writing the entries in the refusal cases below.
const SESSION = randomUUID();

let phraseIds: string[] = [];
let entryIds: string[] = [];
let identityIds: string[] = [];

beforeEach(() => {
  isLettersOpenMock.mockResolvedValue(true);
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

type PhraseKind = "seed" | "user without author" | "user whose author confirmed their key" | "user whose author never confirmed";

async function createPhrase(kind: PhraseKind): Promise<string> {
  return (await createPhraseWithAuthor(kind)).phraseId;
}

async function createPhraseWithAuthor(kind: PhraseKind): Promise<{ phraseId: string; authorKey: string | null }> {
  let identityId: string | null = null;
  let authorKey: string | null = null;
  if (kind === "user whose author confirmed their key" || kind === "user whose author never confirmed") {
    const author = await createIdentityWithReturnKey();
    identityId = author.identityId;
    authorKey = author.returnKey;
    identityIds.push(author.identityId);
    if (kind === "user whose author confirmed their key") await confirmReturnKey(author.returnKey);
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
  return { phraseId: data.id, authorKey };
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

// A confirmed seal for this visitor, tracked for cleanup.
async function sealFor(entryId: string, sessionId: string): Promise<string> {
  const { returnKey, identityId } = await keepVisitorSeal(entryId, sessionId);
  identityIds.push(identityId);
  return returnKey;
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

describe("isPhraseConnectableNow (integration)", () => {
  it.each([
    ["seed", true],
    ["user whose author confirmed their key", true],
    ["user whose author never confirmed", false],
    ["user without author", false],
  ] as const)("a %s phrase → %s", async (kind, expected) => {
    expect(await isPhraseConnectableNow(await createPhrase(kind))).toBe(expected);
  });

  it("answers false for a phrase that doesn't exist", async () => {
    expect(await isPhraseConnectableNow(randomUUID())).toBe(false);
  });

  it("answers false for a connectable phrase while letters are closed", async () => {
    isLettersOpenMock.mockResolvedValue(false);

    expect(await isPhraseConnectableNow(await createPhrase("seed"))).toBe(false);
  });
});

describe("createVisitorReturnKey (integration)", () => {
  it("creates an unconfirmed seal tied to nothing: no phrase, no correspondence", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const before = await countRows("correspondences");

    const result = await createVisitorReturnKey({ entryId, sessionId: session });

    if (result.type !== "created") throw new Error(`expected created, got ${result.type}`);
    expect(result.returnKey).toMatch(/^[0-9]{15}$/);
    const identityId = (await resolveIdentityFromReturnKey(result.returnKey))!;
    identityIds.push(identityId);
    const { data: keys } = await supabaseAdmin.from("identity_keys").select("confirmed_at").eq("identity_id", identityId);
    expect(keys).toEqual([{ confirmed_at: null }]);
    const { count: phrasesOwned } = await supabaseAdmin
      .from("phrases")
      .select("id", { count: "exact", head: true })
      .eq("identity_id", identityId);
    expect(phrasesOwned).toBe(0);
    expect(await countRows("correspondences")).toBe(before);
  });

  it.each([
    ["another session's entry", async () => createMatchedEntry(randomUUID(), await createPhrase("seed")), { type: "entry_not_found" }],
    ["an entry that matched nothing", async () => createMatchedEntry(SESSION, null), { type: "entry_not_found" }],
    ["an unknown entry id", async () => randomUUID(), { type: "entry_not_found" }],
    [
      "a phrase whose author never confirmed their key",
      async () => createMatchedEntry(SESSION, await createPhrase("user whose author never confirmed")),
      { type: "phrase_not_connectable" },
    ],
  ])("refuses %s and creates no identity", async (_label, makeEntry, expected) => {
    const entryId = await makeEntry();
    const before = await countRows("identities");

    expect(await createVisitorReturnKey({ entryId, sessionId: SESSION })).toEqual(expected);
    expect(await countRows("identities")).toBe(before);
  });
});

describe("startCorrespondence (integration)", () => {
  it("starts with a seed phrase and the visitor's confirmed seal; the letter waits for review", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const returnKey = await sealFor(entryId, session);
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await startCorrespondence({ entryId, sessionId: session, returnKey, body: "Gracias por tu frase." });

    if (result.type !== "started") throw new Error(`expected started, got ${result.type}`);
    expect(result.letter).toEqual({ type: "held" });
    const correspondence = await trackVisitor(result.correspondenceId);
    expect(await resolveIdentityFromReturnKey(returnKey)).toBe(correspondence.visitor_identity_id);
    // ADR-004 hard rule: nothing about the entry is stored with the correspondence.
    expect(Object.keys(correspondence).sort()).toEqual(["closed_at", "created_at", "id", "phrase_id", "visitor_identity_id"]);
  });

  it("starts with a phrase whose author opted in and confirmed their key", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("user whose author confirmed their key"));
    const returnKey = await sealFor(entryId, session);
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await startCorrespondence({ entryId, sessionId: session, returnKey, body: "Gracias por tu frase." });

    expect(result.type).toBe("started");
  });

  it("writes the retry after a rejected first letter into the same correspondence", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const returnKey = await sealFor(entryId, session);
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const first = await startCorrespondence({ entryId, sessionId: session, returnKey, body: "Escríbeme al 55 1234 5678" });
    const retry = await startCorrespondence({ entryId, sessionId: session, returnKey, body: "Gracias por tu frase." });

    if (first.type !== "started" || retry.type !== "started") throw new Error("expected both to start");
    expect(first.letter).toEqual({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });
    expect(retry).toEqual({ type: "started", correspondenceId: first.correspondenceId, letter: { type: "held" } });
    expect(await lettersOf(first.correspondenceId)).toEqual([
      { sender: "visitor", status: "rejected" },
      { sender: "visitor", status: "held" },
    ]);
  });

  it("lands two simultaneous tries (double click) in one correspondence with one held letter", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const returnKey = await sealFor(entryId, session);
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
    const input = { entryId, sessionId: session, returnKey, body: "Gracias por tu frase." };

    const results = await Promise.all([startCorrespondence(input), startCorrespondence(input)]);

    const ids = results.map((result) => (result.type === "started" ? result.correspondenceId : null));
    expect(ids[0]).not.toBeNull();
    expect(ids[1]).toBe(ids[0]);
    expect(results.map((result) => (result.type === "started" ? result.letter.type : result.type)).sort()).toEqual([
      "held",
      "not_allowed",
    ]);
    expect(await lettersOf(ids[0]!)).toEqual([{ sender: "visitor", status: "held" }]);
  });

  it("refuses a seal that was never confirmed, creating nothing", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const unconfirmed = await createVisitorReturnKey({ entryId, sessionId: session });
    if (unconfirmed.type !== "created") throw new Error("expected a seal");
    identityIds.push((await resolveIdentityFromReturnKey(unconfirmed.returnKey))!);
    const before = await countRows("correspondences");

    const result = await startCorrespondence({ entryId, sessionId: session, returnKey: unconfirmed.returnKey, body: "hola" });

    expect(result).toEqual({ type: "return_key_not_confirmed" });
    expect(await countRows("correspondences")).toBe(before);
    expect(moderateTextMock).not.toHaveBeenCalled();
  });

  it("refuses a seal that was never issued", async () => {
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));

    expect(await startCorrespondence({ entryId, sessionId: session, returnKey: "111112222233333", body: "hola" })).toEqual({
      type: "return_key_not_recognized",
    });
  });

  it("refuses the phrase's own author writing to themselves", async () => {
    const session = randomUUID();
    const { phraseId, authorKey } = await createPhraseWithAuthor("user whose author confirmed their key");
    const entryId = await createMatchedEntry(session, phraseId);
    const before = await countRows("correspondences");

    const result = await startCorrespondence({ entryId, sessionId: session, returnKey: authorKey!, body: "hola" });

    expect(result).toEqual({ type: "own_phrase" });
    expect(await countRows("correspondences")).toBe(before);
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
    [
      "a phrase whose author never confirmed their key",
      async () => createMatchedEntry(SESSION, await createPhrase("user whose author never confirmed")),
      { type: "phrase_not_connectable" },
    ],
  ])("refuses %s, even with a confirmed seal, and creates nothing", async (_label, makeEntry, expected) => {
    // A real confirmed seal, kept for another entry of this session.
    const sealEntryId = await createMatchedEntry(SESSION, await createPhrase("seed"));
    const returnKey = await sealFor(sealEntryId, SESSION);
    const entryId = await makeEntry();
    const before = await countRows("correspondences");

    const result = await startCorrespondence({ entryId, sessionId: SESSION, returnKey, body: "hola" });

    expect(result).toEqual(expected);
    expect(await countRows("correspondences")).toBe(before);
    expect(moderateTextMock).not.toHaveBeenCalled();
  });

  it("keeps the correspondence, without letters, when moderation is unavailable; the retry writes into it", async () => {
    const session = randomUUID();
    const { phraseId, authorKey } = await createPhraseWithAuthor("user whose author confirmed their key");
    const entryId = await createMatchedEntry(session, phraseId);
    const returnKey = await sealFor(entryId, session);
    moderateTextMock.mockRejectedValueOnce(new Error("OpenAI unavailable"));
    const lettersBefore = await countRows("letters");

    await expect(startCorrespondence({ entryId, sessionId: session, returnKey, body: "hola" })).rejects.toThrow(
      "OpenAI unavailable"
    );

    expect(await countRows("letters")).toBe(lettersBefore);
    // Only its visitor sees it, as their turn; its author never hears of it.
    const visitorMailbox = await getMailboxWithReturnKey(returnKey);
    expect(visitorMailbox!.correspondences.map(({ state, letters }) => [state, letters.length])).toEqual([["your_turn", 0]]);
    expect(await getMailboxWithReturnKey(authorKey!)).toEqual({ correspondences: [] });

    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
    const retry = await startCorrespondence({ entryId, sessionId: session, returnKey, body: "Gracias por tu frase." });

    if (retry.type !== "started") throw new Error(`expected started, got ${retry.type}`);
    expect(retry.correspondenceId).toBe(visitorMailbox!.correspondences[0].id);
    expect(await lettersOf(retry.correspondenceId)).toEqual([{ sender: "visitor", status: "held" }]);
  });

  it("never loses a letter stored by a concurrent try when the try that created the correspondence fails later", async () => {
    // Review of #255: A creates the correspondence and waits in moderation; B finds it and
    // stores its letter; then A's moderation fails. B's letter must survive.
    const session = randomUUID();
    const entryId = await createMatchedEntry(session, await createPhrase("seed"));
    const returnKey = await sealFor(entryId, session);
    const input = { entryId, sessionId: session, returnKey, body: "Gracias por tu frase." };

    let failCreatorModeration!: (error: Error) => void;
    let creatorReachedModeration!: () => void;
    const creatorInModeration = new Promise<void>((resolve) => (creatorReachedModeration = resolve));
    moderateTextMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failCreatorModeration = reject;
          creatorReachedModeration();
        })
    );
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const creator = startCorrespondence(input);
    await creatorInModeration; // A has created the correspondence and is paused in moderation
    const other = await startCorrespondence(input);
    failCreatorModeration(new Error("OpenAI unavailable"));

    await expect(creator).rejects.toThrow("OpenAI unavailable");
    if (other.type !== "started") throw new Error(`expected started, got ${other.type}`);
    expect(other.letter).toEqual({ type: "held" });
    expect(await lettersOf(other.correspondenceId)).toEqual([{ sender: "visitor", status: "held" }]);
  });
});

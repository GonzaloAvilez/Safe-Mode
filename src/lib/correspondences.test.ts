import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  createIdentityWithReturnKeyMock,
  resolveIdentityFromReturnKeyMock,
  hasConfirmedReturnKeyMock,
  deleteIdentityMock,
  submitLetterMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createIdentityWithReturnKeyMock: vi.fn(),
  resolveIdentityFromReturnKeyMock: vi.fn(),
  hasConfirmedReturnKeyMock: vi.fn(),
  deleteIdentityMock: vi.fn(),
  submitLetterMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("@/lib/identity-keys", () => ({
  createIdentityWithReturnKey: createIdentityWithReturnKeyMock,
  resolveIdentityFromReturnKey: resolveIdentityFromReturnKeyMock,
  hasConfirmedReturnKey: hasConfirmedReturnKeyMock,
  deleteIdentity: deleteIdentityMock,
}));
vi.mock("@/lib/letters", () => ({ submitLetter: submitLetterMock }));

const {
  isAnsweredByFounder,
  isPhraseConnectable,
  resolveLetterSender,
  startCorrespondence,
  submitLetterWithReturnKey,
  submitSeedPhraseLetter,
} = await import("@/lib/correspondences");

// resetAllMocks also drops queued mockReturnValueOnce values (see letter-review.test.ts).
afterEach(() => {
  vi.resetAllMocks();
});

// A Supabase query builder stand-in: every chained method is recorded and returns the
// same object; awaiting it, single() or maybeSingle() resolve to `result`.
function query(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const method of ["select", "insert", "delete", "eq"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

// Routes each supabaseAdmin.from(table) call to the next query queued for that table.
function mockTables(tables: Record<string, ReturnType<typeof query>[]>) {
  fromMock.mockImplementation((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    return next.builder;
  });
}

const SEED_PHRASE = { id: "phrase-1", identity_id: null, source: "seed" };
const ownedEntry = (phrase: unknown) => query({ data: { entries: { phrases: phrase } }, error: null });
const INPUT = { entryId: "entry-1", sessionId: "session-1", body: "Gracias por tu frase." };

describe("isAnsweredByFounder", () => {
  it.each([
    [{ identity_id: null, source: "seed" as const }, true],
    [{ identity_id: "author-1", source: "seed" as const }, false], // its author answers, never two
    [{ identity_id: "author-1", source: "user" as const }, false],
    [{ identity_id: null, source: "user" as const }, false],
  ])("%j → %s", (phrase, expected) => {
    expect(isAnsweredByFounder(phrase)).toBe(expected);
  });
});

describe("isPhraseConnectable", () => {
  it.each([
    [{ identity_id: "author-1", source: "user" as const }, true, true],
    [{ identity_id: "author-1", source: "user" as const }, false, false], // author never confirmed their key
    [{ identity_id: null, source: "seed" as const }, false, true], // the founder answers
    [{ identity_id: "author-1", source: "seed" as const }, true, true],
    [{ identity_id: "author-1", source: "seed" as const }, false, false], // its author answers, not the founder
    [{ identity_id: null, source: "user" as const }, false, false], // pre-existing user phrase, no author (OD-5)
  ])("%j with the author's key confirmed: %s → %s", (phrase, authorKeyConfirmed, expected) => {
    expect(isPhraseConnectable(phrase, authorKeyConfirmed)).toBe(expected);
  });
});

describe("startCorrespondence", () => {
  it("creates the identity, then the correspondence, then sends the first letter, and returns the key", async () => {
    const responses = ownedEntry(SEED_PHRASE);
    const correspondences = query({ data: { id: "correspondence-1" }, error: null });
    mockTables({ responses: [responses], correspondences: [correspondences] });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockResolvedValue({ type: "held" });

    const result = await startCorrespondence(INPUT);

    expect(result).toEqual({
      type: "started",
      correspondenceId: "correspondence-1",
      returnKey: "the-key",
      letter: { type: "held" },
    });
    expect(responses.calls).toContainEqual(["eq", ["entry_id", "entry-1"]]);
    expect(responses.calls).toContainEqual(["eq", ["session_id", "session-1"]]); // ownership
    expect(correspondences.calls).toContainEqual(["insert", [{ phrase_id: "phrase-1", visitor_identity_id: "identity-1" }]]);
    expect(submitLetterMock).toHaveBeenCalledWith({
      correspondenceId: "correspondence-1",
      sender: "visitor",
      body: "Gracias por tu frase.",
    });
  });

  it("never stores the entry with the correspondence (ADR-004 hard rule)", async () => {
    const correspondences = query({ data: { id: "correspondence-1" }, error: null });
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [correspondences] });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockResolvedValue({ type: "held" });

    await startCorrespondence(INPUT);

    const inserted = correspondences.calls.find(([method]) => method === "insert")![1][0];
    expect(JSON.stringify(inserted)).not.toContain("entry");
  });

  it("still starts, and hands over the key, when the first letter is rejected (so the visitor can retry)", async () => {
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [query({ data: { id: "c1" }, error: null })] });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockResolvedValue({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });

    const result = await startCorrespondence(INPUT);

    expect(result).toMatchObject({ type: "started", returnKey: "the-key", letter: { type: "rejected" } });
  });

  it.each([
    ["not this session's entry, or an unknown id", query({ data: null, error: null })],
    ["an entry that matched no phrase", ownedEntry(null)],
  ])("answers entry_not_found for %s, creating nothing", async (_label, responses) => {
    mockTables({ responses: [responses] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "entry_not_found" });
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers phrase_not_connectable for a user phrase without an author, creating nothing", async () => {
    mockTables({ responses: [ownedEntry({ id: "phrase-2", identity_id: null, source: "user" })] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "phrase_not_connectable" });
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
    expect(hasConfirmedReturnKeyMock).not.toHaveBeenCalled();
  });

  it("answers phrase_not_connectable while the author hasn't confirmed their key, creating nothing", async () => {
    mockTables({ responses: [ownedEntry({ id: "phrase-3", identity_id: "author-1", source: "user" })] });
    hasConfirmedReturnKeyMock.mockResolvedValue(false);

    expect(await startCorrespondence(INPUT)).toEqual({ type: "phrase_not_connectable" });
    expect(hasConfirmedReturnKeyMock).toHaveBeenCalledWith("author-1");
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("starts with a phrase whose author confirmed their key", async () => {
    mockTables({
      responses: [ownedEntry({ id: "phrase-3", identity_id: "author-1", source: "user" })],
      correspondences: [query({ data: { id: "c1" }, error: null })],
    });
    hasConfirmedReturnKeyMock.mockResolvedValue(true);
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockResolvedValue({ type: "held" });

    expect(await startCorrespondence(INPUT)).toMatchObject({ type: "started", correspondenceId: "c1" });
    expect(hasConfirmedReturnKeyMock).toHaveBeenCalledWith("author-1");
  });

  it("deletes the identity and hands over no key when the correspondence can't be created", async () => {
    const insertError = { message: "connection failure" };
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [query({ data: null, error: insertError })],
    });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(insertError);
    expect(deleteIdentityMock).toHaveBeenCalledWith("identity-1");
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("undoes the whole start when the first letter couldn't be stored (moderation unavailable)", async () => {
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [query({ data: { id: "c1" }, error: null })],
    });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(startCorrespondence(INPUT)).rejects.toThrow("OpenAI unavailable");
    expect(deleteIdentityMock).toHaveBeenCalledWith("identity-1"); // cascades to the correspondence
  });

  it("throws when the entry lookup fails", async () => {
    const error = { message: "connection failure" };
    mockTables({ responses: [query({ data: null, error })] });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(error);
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });
});

// A correspondence as resolveLetterSender reads it: the visitor's identity and the
// identity of the phrase's author (null for a seed phrase or a phrase without an author).
const correspondenceIdentities = (authorIdentityId: string | null) =>
  query({ data: { visitor_identity_id: "visitor-1", phrases: { identity_id: authorIdentityId } }, error: null });

describe("resolveLetterSender", () => {
  it.each([
    ["the visitor who started it", "visitor-1", "author-1", "visitor"],
    ["the author of its phrase", "author-1", "author-1", "author"],
    ["an identity from another correspondence", "stranger-1", "author-1", null],
    ["anyone but the visitor, on a seed phrase (no author identity)", "stranger-1", null, null],
  ])("answers for %s", async (_label, identityId, authorIdentityId, expected) => {
    const correspondences = correspondenceIdentities(authorIdentityId);
    mockTables({ correspondences: [correspondences] });

    expect(await resolveLetterSender("correspondence-1", identityId)).toBe(expected);
    expect(correspondences.calls).toEqual([
      ["select", ["visitor_identity_id, phrases(identity_id)"]],
      ["eq", ["id", "correspondence-1"]],
    ]);
  });

  it("answers null for a correspondence that doesn't exist", async () => {
    mockTables({ correspondences: [query({ data: null, error: null })] });

    expect(await resolveLetterSender("missing", "visitor-1")).toBeNull();
  });

  it("throws when the lookup fails", async () => {
    const error = { message: "connection failure" };
    mockTables({ correspondences: [query({ data: null, error })] });

    await expect(resolveLetterSender("correspondence-1", "visitor-1")).rejects.toEqual(error);
  });
});

describe("submitLetterWithReturnKey", () => {
  const LETTER = { correspondenceId: "correspondence-1", returnKey: "the-key", body: "Gracias por responder." };

  it.each([
    ["visitor", "visitor-1"],
    ["author", "author-1"],
  ])("sends the letter as the %s when the key belongs to that side", async (sender, identityId) => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue(identityId);
    mockTables({ correspondences: [correspondenceIdentities("author-1")] });
    submitLetterMock.mockResolvedValue({ type: "held" });

    expect(await submitLetterWithReturnKey(LETTER)).toEqual({ type: "held" });
    expect(resolveIdentityFromReturnKeyMock).toHaveBeenCalledWith("the-key");
    expect(submitLetterMock).toHaveBeenCalledWith({
      correspondenceId: "correspondence-1",
      sender,
      body: "Gracias por responder.",
    });
  });

  it("answers not_found for a key that doesn't exist, without looking up the correspondence", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue(null);
    mockTables({});

    expect(await submitLetterWithReturnKey(LETTER)).toEqual({ type: "not_found" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("answers not_found for a real key that isn't part of this correspondence", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue("stranger-1");
    mockTables({ correspondences: [correspondenceIdentities("author-1")] });

    expect(await submitLetterWithReturnKey(LETTER)).toEqual({ type: "not_found" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("passes submitLetter's outcome through unchanged (turn rules live there)", async () => {
    const notYourTurn = { type: "not_allowed", reason: "not_your_turn" };
    resolveIdentityFromReturnKeyMock.mockResolvedValue("visitor-1");
    mockTables({ correspondences: [correspondenceIdentities("author-1")] });
    submitLetterMock.mockResolvedValue(notYourTurn);

    expect(await submitLetterWithReturnKey(LETTER)).toEqual(notYourTurn);
  });
});

describe("submitSeedPhraseLetter", () => {
  const LETTER = { correspondenceId: "correspondence-1", body: "Gracias por escribirme." };
  const correspondencePhrase = (phrase: unknown) => query({ data: { phrases: phrase }, error: null });

  it("sends the founder's letter as the author on a seed phrase without an author", async () => {
    const correspondences = correspondencePhrase({ identity_id: null, source: "seed" });
    mockTables({ correspondences: [correspondences] });
    submitLetterMock.mockResolvedValue({ type: "held" });

    expect(await submitSeedPhraseLetter(LETTER)).toEqual({ type: "held" });
    expect(correspondences.calls).toEqual([
      ["select", ["phrases(identity_id, source)"]],
      ["eq", ["id", "correspondence-1"]],
    ]);
    expect(submitLetterMock).toHaveBeenCalledWith({
      correspondenceId: "correspondence-1",
      sender: "author",
      body: "Gracias por escribirme.",
    });
  });

  it.each([
    ["a user phrase with its own author", { identity_id: "author-1", source: "user" }],
    ["a user phrase without an author", { identity_id: null, source: "user" }],
    ["a seed phrase that has an author identity", { identity_id: "author-1", source: "seed" }],
  ])("answers not_found and writes nothing on %s", async (_label, phrase) => {
    mockTables({ correspondences: [correspondencePhrase(phrase)] });

    expect(await submitSeedPhraseLetter(LETTER)).toEqual({ type: "not_found" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("answers not_found for a correspondence that doesn't exist", async () => {
    mockTables({ correspondences: [query({ data: null, error: null })] });

    expect(await submitSeedPhraseLetter(LETTER)).toEqual({ type: "not_found" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("passes submitLetter's outcome through unchanged (turn rules and safety live there)", async () => {
    const rejected = { type: "rejected", reason: "contact_info", contactKinds: ["email"] };
    mockTables({ correspondences: [correspondencePhrase({ identity_id: null, source: "seed" })] });
    submitLetterMock.mockResolvedValue(rejected);

    expect(await submitSeedPhraseLetter(LETTER)).toEqual(rejected);
  });

  it("throws when the lookup fails, writing nothing", async () => {
    const error = { message: "connection failure" };
    mockTables({ correspondences: [query({ data: null, error })] });

    await expect(submitSeedPhraseLetter(LETTER)).rejects.toEqual(error);
    expect(submitLetterMock).not.toHaveBeenCalled();
  });
});

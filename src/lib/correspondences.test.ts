import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  createIdentityWithReturnKeyMock,
  resolveIdentityFromReturnKeyMock,
  hasConfirmedReturnKeyMock,
  submitLetterMock,
  isLettersOpenMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createIdentityWithReturnKeyMock: vi.fn(),
  resolveIdentityFromReturnKeyMock: vi.fn(),
  hasConfirmedReturnKeyMock: vi.fn(),
  submitLetterMock: vi.fn(),
  isLettersOpenMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("@/lib/identity-keys", () => ({
  createIdentityWithReturnKey: createIdentityWithReturnKeyMock,
  resolveIdentityFromReturnKey: resolveIdentityFromReturnKeyMock,
  hasConfirmedReturnKey: hasConfirmedReturnKeyMock,
}));
vi.mock("@/lib/letters", () => ({ submitLetter: submitLetterMock }));
vi.mock("@/lib/settings", () => ({ isLettersOpen: isLettersOpenMock }));

const {
  createVisitorReturnKey,
  isAnsweredByFounder,
  isPhraseConnectable,
  isPhraseConnectableNow,
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
const noRow = () => query({ data: null, error: null });

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

// Which identities hold a confirmed return key, for hasConfirmedReturnKey.
function confirmedIdentities(...identityIds: string[]) {
  hasConfirmedReturnKeyMock.mockImplementation(async (identityId: string) => identityIds.includes(identityId));
}

describe("isPhraseConnectableNow", () => {
  const phraseRow = (phrase: unknown) => query({ data: phrase, error: null });

  it("reads the phrase by id and answers true for a seed phrase the founder answers", async () => {
    isLettersOpenMock.mockResolvedValue(true);
    const phrases = phraseRow({ identity_id: null, source: "seed" });
    mockTables({ phrases: [phrases] });

    expect(await isPhraseConnectableNow("phrase-1")).toBe(true);
    expect(phrases.calls).toEqual([
      ["select", ["identity_id, source"]],
      ["eq", ["id", "phrase-1"]],
    ]);
  });

  it.each([
    ["an author who confirmed their key", { identity_id: "author-1", source: "user" }, ["author-1"], true],
    ["an author who never confirmed their key", { identity_id: "author-1", source: "user" }, [], false],
    ["a user phrase without an author (OD-5)", { identity_id: null, source: "user" }, [], false],
  ])("for a phrase with %s answers %s", async (_label, phrase, confirmed, expected) => {
    isLettersOpenMock.mockResolvedValue(true);
    mockTables({ phrases: [phraseRow(phrase)] });
    confirmedIdentities(...confirmed);

    expect(await isPhraseConnectableNow("phrase-1")).toBe(expected);
  });

  it("answers false while letters are closed, without reading the phrase", async () => {
    isLettersOpenMock.mockResolvedValue(false);

    expect(await isPhraseConnectableNow("phrase-1")).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("answers false for a phrase that no longer exists", async () => {
    isLettersOpenMock.mockResolvedValue(true);
    mockTables({ phrases: [noRow()] });

    expect(await isPhraseConnectableNow("missing")).toBe(false);
    expect(hasConfirmedReturnKeyMock).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails", async () => {
    isLettersOpenMock.mockResolvedValue(true);
    const error = { message: "connection failure" };
    mockTables({ phrases: [query({ data: null, error })] });

    await expect(isPhraseConnectableNow("phrase-1")).rejects.toEqual(error);
  });
});

describe("createVisitorReturnKey", () => {
  const INPUT = { entryId: "entry-1", sessionId: "session-1" };

  it("creates a seal for this session's entry when letters can reach its phrase", async () => {
    const responses = ownedEntry(SEED_PHRASE);
    mockTables({ responses: [responses] });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "visitor-1", returnKey: "the-key" });

    expect(await createVisitorReturnKey(INPUT)).toEqual({ type: "created", returnKey: "the-key" });
    expect(responses.calls).toContainEqual(["eq", ["entry_id", "entry-1"]]);
    expect(responses.calls).toContainEqual(["eq", ["session_id", "session-1"]]); // ownership
  });

  it("ties the seal to nothing: no entry, phrase or correspondence is written with it", async () => {
    mockTables({ responses: [ownedEntry(SEED_PHRASE)] });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "visitor-1", returnKey: "the-key" });

    await createVisitorReturnKey(INPUT);

    expect(createIdentityWithReturnKeyMock).toHaveBeenCalledWith();
    expect(fromMock).toHaveBeenCalledTimes(1); // only the entry lookup, a read
  });

  it("creates a seal for a user phrase whose author confirmed their key", async () => {
    mockTables({ responses: [ownedEntry({ id: "phrase-3", identity_id: "author-1", source: "user" })] });
    confirmedIdentities("author-1");
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "visitor-1", returnKey: "the-key" });

    expect(await createVisitorReturnKey(INPUT)).toEqual({ type: "created", returnKey: "the-key" });
  });

  it.each([
    ["not this session's entry, or an unknown id", noRow()],
    ["an entry that matched no phrase", ownedEntry(null)],
  ])("answers entry_not_found for %s, creating no seal", async (_label, responses) => {
    mockTables({ responses: [responses] });

    expect(await createVisitorReturnKey(INPUT)).toEqual({ type: "entry_not_found" });
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a user phrase without an author", { id: "phrase-2", identity_id: null, source: "user" }],
    ["a phrase whose author never confirmed their key", { id: "phrase-3", identity_id: "author-1", source: "user" }],
  ])("answers phrase_not_connectable for %s, creating no seal", async (_label, phrase) => {
    mockTables({ responses: [ownedEntry(phrase)] });
    confirmedIdentities();

    expect(await createVisitorReturnKey(INPUT)).toEqual({ type: "phrase_not_connectable" });
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("throws when the seal can't be created", async () => {
    mockTables({ responses: [ownedEntry(SEED_PHRASE)] });
    createIdentityWithReturnKeyMock.mockRejectedValue(new Error("insert failed"));

    await expect(createVisitorReturnKey(INPUT)).rejects.toThrow("insert failed");
  });
});

describe("startCorrespondence", () => {
  const INPUT = { entryId: "entry-1", sessionId: "session-1", returnKey: "the-key", body: "Gracias por tu frase." };
  const created = (id: string) => query({ data: { id }, error: null });
  const existing = (id: string) => query({ data: { id }, error: null });
  const uniqueViolation = (constraint: string) =>
    query({
      data: null,
      error: { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` },
    });
  const ONE_PER_VISITOR_AND_PHRASE = "correspondences_phrase_id_visitor_identity_id_key";

  // A visitor whose seal is real and confirmed, unless a test says otherwise.
  function visitorWithConfirmedSeal(...alsoConfirmed: string[]) {
    resolveIdentityFromReturnKeyMock.mockResolvedValue("visitor-1");
    confirmedIdentities("visitor-1", ...alsoConfirmed);
  }

  it("creates the correspondence with the visitor's seal and sends the first letter into it", async () => {
    visitorWithConfirmedSeal();
    const lookup = noRow();
    const insert = created("correspondence-1");
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [lookup, insert] });
    submitLetterMock.mockResolvedValue({ type: "held" });

    const result = await startCorrespondence(INPUT);

    expect(result).toEqual({ type: "started", correspondenceId: "correspondence-1", letter: { type: "held" } });
    expect(resolveIdentityFromReturnKeyMock).toHaveBeenCalledWith("the-key");
    expect(lookup.calls).toEqual([
      ["select", ["id"]],
      ["eq", ["phrase_id", "phrase-1"]],
      ["eq", ["visitor_identity_id", "visitor-1"]],
    ]);
    expect(insert.calls).toContainEqual(["insert", [{ phrase_id: "phrase-1", visitor_identity_id: "visitor-1" }]]);
    expect(submitLetterMock).toHaveBeenCalledWith({
      correspondenceId: "correspondence-1",
      sender: "visitor",
      body: "Gracias por tu frase.",
    });
  });

  it("never hands the seal back: the visitor already holds it", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), created("c1")] });
    submitLetterMock.mockResolvedValue({ type: "held" });

    expect(JSON.stringify(await startCorrespondence(INPUT))).not.toContain("the-key");
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });

  it("never stores the entry with the correspondence (ADR-004 hard rule)", async () => {
    visitorWithConfirmedSeal();
    const insert = created("c1");
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), insert] });
    submitLetterMock.mockResolvedValue({ type: "held" });

    await startCorrespondence(INPUT);

    const inserted = insert.calls.find(([method]) => method === "insert")![1][0];
    expect(JSON.stringify(inserted)).not.toContain("entry");
  });

  it("writes into the visitor's existing correspondence with that phrase instead of creating another", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [existing("correspondence-1")] });
    submitLetterMock.mockResolvedValue({ type: "held" }); // e.g. after a rejected first letter

    expect(await startCorrespondence(INPUT)).toEqual({
      type: "started",
      correspondenceId: "correspondence-1",
      letter: { type: "held" },
    });
    expect(submitLetterMock).toHaveBeenCalledWith(expect.objectContaining({ correspondenceId: "correspondence-1" }));
  });

  it("passes the letter's own answer through, e.g. a second try while the first waits for review", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [existing("c1")] });
    submitLetterMock.mockResolvedValue({ type: "not_allowed", reason: "awaiting_review" });

    expect(await startCorrespondence(INPUT)).toEqual({
      type: "started",
      correspondenceId: "c1",
      letter: { type: "not_allowed", reason: "awaiting_review" },
    });
  });

  it("still starts when the first letter is rejected, so the visitor can retry into the same correspondence", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), created("c1")] });
    submitLetterMock.mockResolvedValue({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });

    expect(await startCorrespondence(INPUT)).toMatchObject({ type: "started", correspondenceId: "c1", letter: { type: "rejected" } });
  });

  it("writes into the correspondence a racing try created first (double click)", async () => {
    visitorWithConfirmedSeal();
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [noRow(), uniqueViolation(ONE_PER_VISITOR_AND_PHRASE), existing("winner-1")],
    });
    submitLetterMock.mockResolvedValue({ type: "not_allowed", reason: "awaiting_review" });

    expect(await startCorrespondence(INPUT)).toMatchObject({ type: "started", correspondenceId: "winner-1" });
  });

  it("never deletes the correspondence a racing try created when this try's letter fails", async () => {
    visitorWithConfirmedSeal();
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [noRow(), uniqueViolation(ONE_PER_VISITOR_AND_PHRASE), existing("winner-1")],
    });
    submitLetterMock.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(startCorrespondence(INPUT)).rejects.toThrow("OpenAI unavailable");
    expect(fromMock).toHaveBeenCalledTimes(4); // entry, lookup, insert, winner lookup: no delete
  });

  it("throws on a unique violation of any other constraint", async () => {
    visitorWithConfirmedSeal();
    const conflict = uniqueViolation("some_other_key");
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), conflict] });

    await expect(startCorrespondence(INPUT)).rejects.toMatchObject({ code: "23505" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("throws on any other error, even one that names the same constraint", async () => {
    visitorWithConfirmedSeal();
    const notAUniqueViolation = query({
      data: null,
      error: { code: "23514", message: `check failed near "${ONE_PER_VISITOR_AND_PHRASE}"` },
    });
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), notAUniqueViolation] });

    await expect(startCorrespondence(INPUT)).rejects.toMatchObject({ code: "23514" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("throws when the racing winner can't be found after the conflict", async () => {
    visitorWithConfirmedSeal();
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [noRow(), uniqueViolation(ONE_PER_VISITOR_AND_PHRASE), noRow()],
    });

    await expect(startCorrespondence(INPUT)).rejects.toMatchObject({ code: "23505" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("answers return_key_not_recognized for a seal that matches no identity, reading nothing else", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue(null);

    expect(await startCorrespondence(INPUT)).toEqual({ type: "return_key_not_recognized" });
    expect(hasConfirmedReturnKeyMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("answers return_key_not_confirmed for a seal its holder never confirmed, reading no entry", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue("visitor-1");
    confirmedIdentities();

    expect(await startCorrespondence(INPUT)).toEqual({ type: "return_key_not_confirmed" });
    expect(hasConfirmedReturnKeyMock).toHaveBeenCalledWith("visitor-1");
    expect(fromMock).not.toHaveBeenCalled();
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it.each([
    ["not this session's entry, or an unknown id", noRow()],
    ["an entry that matched no phrase", ownedEntry(null)],
  ])("answers entry_not_found for %s, creating nothing", async (_label, responses) => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [responses] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "entry_not_found" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("answers phrase_not_connectable for a user phrase without an author, creating nothing", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry({ id: "phrase-2", identity_id: null, source: "user" })] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "phrase_not_connectable" });
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("answers phrase_not_connectable while the author hasn't confirmed their key, creating nothing", async () => {
    visitorWithConfirmedSeal();
    mockTables({ responses: [ownedEntry({ id: "phrase-3", identity_id: "author-1", source: "user" })] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "phrase_not_connectable" });
    expect(hasConfirmedReturnKeyMock).toHaveBeenCalledWith("author-1");
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("starts with a phrase whose author confirmed their key", async () => {
    visitorWithConfirmedSeal("author-1");
    mockTables({
      responses: [ownedEntry({ id: "phrase-3", identity_id: "author-1", source: "user" })],
      correspondences: [noRow(), created("c1")],
    });
    submitLetterMock.mockResolvedValue({ type: "held" });

    expect(await startCorrespondence(INPUT)).toMatchObject({ type: "started", correspondenceId: "c1" });
  });

  it("answers own_phrase when the seal belongs to the phrase's own author, creating nothing", async () => {
    visitorWithConfirmedSeal(); // visitor-1 is also the author here, and confirmed
    mockTables({ responses: [ownedEntry({ id: "phrase-3", identity_id: "visitor-1", source: "user" })] });

    expect(await startCorrespondence(INPUT)).toEqual({ type: "own_phrase" });
    expect(submitLetterMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledTimes(1); // the entry lookup only
  });

  it.each([
    ["it just created", [noRow(), created("c1")], 3],
    ["already there from an earlier try", [existing("c1")], 2],
  ])(
    "keeps the correspondence %s, deleting nothing, when the letter couldn't be stored",
    async (_label, correspondences, queries) => {
      visitorWithConfirmedSeal();
      mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences });
      submitLetterMock.mockRejectedValue(new Error("OpenAI unavailable"));

      await expect(startCorrespondence(INPUT)).rejects.toThrow("OpenAI unavailable");
      // A try running at the same time may have stored its letter in it (review of #255).
      expect(fromMock).toHaveBeenCalledTimes(queries); // entry, lookup (and insert): never a delete
    }
  );

  it("throws, sending no letter, when the correspondence can't be created", async () => {
    visitorWithConfirmedSeal();
    const insertError = { code: "08006", message: "connection failure" };
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [noRow(), query({ data: null, error: insertError })] });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(insertError);
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("throws when the correspondence lookup fails", async () => {
    visitorWithConfirmedSeal();
    const error = { message: "connection failure" };
    mockTables({ responses: [ownedEntry(SEED_PHRASE)], correspondences: [query({ data: null, error })] });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(error);
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("throws when the entry lookup fails", async () => {
    visitorWithConfirmedSeal();
    const error = { message: "connection failure" };
    mockTables({ responses: [query({ data: null, error })] });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(error);
    expect(submitLetterMock).not.toHaveBeenCalled();
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

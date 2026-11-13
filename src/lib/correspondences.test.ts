import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock, createIdentityWithReturnKeyMock, submitLetterMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createIdentityWithReturnKeyMock: vi.fn(),
  submitLetterMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("@/lib/identity-keys", () => ({ createIdentityWithReturnKey: createIdentityWithReturnKeyMock }));
vi.mock("@/lib/letters", () => ({ submitLetter: submitLetterMock }));

const { isPhraseConnectable, startCorrespondence } = await import("@/lib/correspondences");

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

describe("isPhraseConnectable", () => {
  it.each([
    [{ identity_id: "author-1", source: "user" as const }, true],
    [{ identity_id: null, source: "seed" as const }, true],
    [{ identity_id: null, source: "user" as const }, false], // pre-existing user phrase, no author (OD-5)
  ])("%j → %s", (phrase, expected) => {
    expect(isPhraseConnectable(phrase)).toBe(expected);
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
  });

  it("deletes the identity and hands over no key when the correspondence can't be created", async () => {
    const insertError = { message: "connection failure" };
    const identities = query({ error: null });
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [query({ data: null, error: insertError })],
      identities: [identities],
    });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(insertError);
    expect(identities.calls).toEqual([["delete", []], ["eq", ["id", "identity-1"]]]);
    expect(submitLetterMock).not.toHaveBeenCalled();
  });

  it("undoes the whole start when the first letter couldn't be stored (moderation unavailable)", async () => {
    const identities = query({ error: null });
    mockTables({
      responses: [ownedEntry(SEED_PHRASE)],
      correspondences: [query({ data: { id: "c1" }, error: null })],
      identities: [identities],
    });
    createIdentityWithReturnKeyMock.mockResolvedValue({ identityId: "identity-1", returnKey: "the-key" });
    submitLetterMock.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(startCorrespondence(INPUT)).rejects.toThrow("OpenAI unavailable");
    expect(identities.calls).toEqual([["delete", []], ["eq", ["id", "identity-1"]]]); // cascades to the correspondence
  });

  it("throws when the entry lookup fails", async () => {
    const error = { message: "connection failure" };
    mockTables({ responses: [query({ data: null, error })] });

    await expect(startCorrespondence(INPUT)).rejects.toEqual(error);
    expect(createIdentityWithReturnKeyMock).not.toHaveBeenCalled();
  });
});

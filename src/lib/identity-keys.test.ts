import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const {
  generateReturnKey,
  normalizeReturnKey,
  hashReturnKey,
  isWellFormedReturnKey,
  createIdentityWithReturnKey,
  resolveIdentityFromReturnKey,
  confirmReturnKey,
  hasConfirmedReturnKey,
} = await import("@/lib/identity-keys");

const SECRET = "test-return-key-hash-secret-0123456789";
const SEAL = "482133901756229";
// A key in the format issued before the seal (#209): 43 base64url characters.
const LEGACY_KEY = "Zx9_k2Lm-Qw8Rt5Yu1Io3Pa7Sd4Fg6Hj0Kl2Zx9Cv5B";

beforeEach(() => {
  process.env.RETURN_KEY_HASH_SECRET = SECRET;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RETURN_KEY_HASH_SECRET;
});

describe("generateReturnKey", () => {
  it("produces a well-formed 15-digit seal", () => {
    const key = generateReturnKey();
    expect(key).toMatch(/^[0-9]{15}$/);
    expect(isWellFormedReturnKey(key)).toBe(true);
  });

  it("produces a different key every time", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateReturnKey()));
    expect(keys.size).toBe(1000);
  });

  // Every position must be able to hold every digit, a leading 0 included (the key is a
  // string, never a number that would drop it). With 2,000 keys, a digit missing from a
  // position by chance has a probability around 10^-90.
  it("uses every digit in every position", () => {
    const keys = Array.from({ length: 2000 }, () => generateReturnKey());
    for (let position = 0; position < 15; position++) {
      expect(new Set(keys.map((key) => key[position])).size).toBe(10);
    }
  });
});

describe("normalizeReturnKey", () => {
  it.each([
    ["the bare digits", SEAL],
    ["the groups as the card shows them", "48213 · 39017 · 56229"],
    ["spaces between groups", "48213 39017 56229"],
    ["hyphens between groups", "48213-39017-56229"],
    ["dots between groups", "48213.39017.56229"],
    ["surrounding whitespace and line breaks", "  48213\n39017\t56229 "],
  ])("reads a seal typed with %s", (_label, input) => {
    expect(normalizeReturnKey(input)).toBe(SEAL);
  });

  it("keeps a legacy key exactly as it is (it's case-sensitive)", () => {
    expect(normalizeReturnKey(` ${LEGACY_KEY} `)).toBe(LEGACY_KEY);
  });

  it.each([
    ["empty", ""],
    ["14 digits", "48213390175622"],
    ["16 digits", "4821339017562290"],
    ["a letter among the digits", "48213 39017 5622a"],
    ["a letter O instead of a zero", "48213 39O17 56229"],
    ["another separator", "48213/39017/56229"],
    ["non-ASCII digits", "٤٨٢١٣٣٩٠١٧٥٦٢٢٩"],
    ["a legacy key one character short", LEGACY_KEY.slice(1)],
    ["a legacy key with a character outside base64url", `${LEGACY_KEY.slice(1)}=`],
  ])("rejects %s", (_label, input) => {
    expect(normalizeReturnKey(input)).toBeNull();
    expect(isWellFormedReturnKey(input)).toBe(false);
  });
});

describe("hashReturnKey", () => {
  it("hashes a seal with HMAC-SHA256 and the server secret, never a plain SHA-256", () => {
    const hash = hashReturnKey(SEAL);
    expect(hash).toBe(createHmac("sha256", SECRET).update(SEAL).digest("hex"));
    expect(hash).not.toBe(createHash("sha256").update(SEAL).digest("hex"));
    expect(hash).not.toContain(SEAL);
  });

  it("gives the same hash however the seal was typed", () => {
    expect(hashReturnKey("48213 · 39017 · 56229")).toBe(hashReturnKey(SEAL));
  });

  it("depends on the secret", () => {
    const hash = hashReturnKey(SEAL);
    process.env.RETURN_KEY_HASH_SECRET = `${SECRET}-other`;
    expect(hashReturnKey(SEAL)).not.toBe(hash);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["shorter than 32 characters", "a".repeat(31)],
  ])("refuses to hash a seal when the secret is %s", (_label, secret) => {
    if (secret === undefined) delete process.env.RETURN_KEY_HASH_SECRET;
    else process.env.RETURN_KEY_HASH_SECRET = secret;

    expect(() => hashReturnKey(SEAL)).toThrow("RETURN_KEY_HASH_SECRET");
  });

  it("keeps a legacy key's plain SHA-256, which is how those rows were stored, even without the secret", () => {
    delete process.env.RETURN_KEY_HASH_SECRET;
    expect(hashReturnKey(LEGACY_KEY)).toBe(createHash("sha256").update(LEGACY_KEY).digest("hex"));
  });

  it("throws for something that isn't a key", () => {
    expect(() => hashReturnKey("not-a-key")).toThrow("not a return key");
  });
});

describe("createIdentityWithReturnKey", () => {
  function mockIdentityInsert(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ single });
    return { insert: vi.fn().mockReturnValue({ select }) };
  }

  it("creates an identity, stores only the key's hash, and returns the raw key once", async () => {
    const identities = mockIdentityInsert({ data: { id: "identity-1" }, error: null });
    const keyInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => (table === "identities" ? identities : { insert: keyInsert }));

    const { identityId, returnKey } = await createIdentityWithReturnKey();

    expect(identityId).toBe("identity-1");
    expect(isWellFormedReturnKey(returnKey)).toBe(true);
    expect(keyInsert).toHaveBeenCalledWith({
      identity_id: "identity-1",
      kind: "return_key",
      key_hash: hashReturnKey(returnKey),
    });
    expect(JSON.stringify(keyInsert.mock.calls)).not.toContain(returnKey);
  });

  it("deletes the identity and throws when the key insert fails", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const identities = { ...mockIdentityInsert({ data: { id: "identity-1" }, error: null }), delete: vi.fn().mockReturnValue({ eq }) };
    const keyInsert = vi.fn().mockResolvedValue({ error: new Error("key insert failed") });
    fromMock.mockImplementation((table: string) => (table === "identities" ? identities : { insert: keyInsert }));

    await expect(createIdentityWithReturnKey()).rejects.toThrow("key insert failed");
    expect(eq).toHaveBeenCalledWith("id", "identity-1");
  });

  it("throws when the identity insert fails", async () => {
    fromMock.mockReturnValue(mockIdentityInsert({ data: null, error: new Error("identity insert failed") }));

    await expect(createIdentityWithReturnKey()).rejects.toThrow("identity insert failed");
  });

  it("writes nothing when the secret is missing (no empty identity left behind)", async () => {
    delete process.env.RETURN_KEY_HASH_SECRET;

    await expect(createIdentityWithReturnKey()).rejects.toThrow("RETURN_KEY_HASH_SECRET");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("resolveIdentityFromReturnKey", () => {
  function mockLookup(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eqHash = vi.fn().mockReturnValue({ maybeSingle });
    const eqKind = vi.fn().mockReturnValue({ eq: eqHash });
    fromMock.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqKind }) });
    return { eqKind, eqHash };
  }

  it("looks up the key by its hash and returns the identity", async () => {
    const key = generateReturnKey();
    const { eqKind, eqHash } = mockLookup({ data: { identity_id: "identity-1" }, error: null });

    await expect(resolveIdentityFromReturnKey(key)).resolves.toBe("identity-1");
    expect(fromMock).toHaveBeenCalledWith("identity_keys");
    expect(eqKind).toHaveBeenCalledWith("kind", "return_key");
    expect(eqHash).toHaveBeenCalledWith("key_hash", hashReturnKey(key));
  });

  it("finds the same key however the seal was typed", async () => {
    const { eqHash } = mockLookup({ data: { identity_id: "identity-1" }, error: null });

    await expect(resolveIdentityFromReturnKey("48213 · 39017 · 56229")).resolves.toBe("identity-1");
    expect(eqHash).toHaveBeenCalledWith("key_hash", createHmac("sha256", SECRET).update(SEAL).digest("hex"));
  });

  it("still finds a legacy key by its plain SHA-256", async () => {
    const { eqHash } = mockLookup({ data: { identity_id: "identity-1" }, error: null });

    await expect(resolveIdentityFromReturnKey(LEGACY_KEY)).resolves.toBe("identity-1");
    expect(eqHash).toHaveBeenCalledWith("key_hash", createHash("sha256").update(LEGACY_KEY).digest("hex"));
  });

  it("returns null when no key matches", async () => {
    mockLookup({ data: null, error: null });
    await expect(resolveIdentityFromReturnKey(generateReturnKey())).resolves.toBeNull();
  });

  it("returns null for a malformed key without querying the database", async () => {
    await expect(resolveIdentityFromReturnKey("not-a-key")).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails", async () => {
    mockLookup({ data: null, error: new Error("lookup failed") });
    await expect(resolveIdentityFromReturnKey(generateReturnKey())).rejects.toThrow("lookup failed");
  });
});

// A Supabase query builder stand-in: every chained method is recorded and returns the
// same object; awaiting it, or maybeSingle(), resolves to `result`.
function query(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const method of ["select", "update", "eq", "is", "not", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

function mockQueries(...queries: ReturnType<typeof query>[]) {
  for (const { builder } of queries) fromMock.mockReturnValueOnce(builder);
}

describe("confirmReturnKey", () => {
  const sealHash = () => createHmac("sha256", SECRET).update(SEAL).digest("hex");

  it("records the confirmation on the key's row, only if it wasn't confirmed yet", async () => {
    const confirm = query({ data: [{ id: "key-1" }], error: null });
    mockQueries(confirm);

    await expect(confirmReturnKey("48213 · 39017 · 56229")).resolves.toBe(true);

    expect(fromMock).toHaveBeenCalledWith("identity_keys");
    const update = confirm.calls.find(([method]) => method === "update")![1][0] as { confirmed_at: string };
    expect(Number.isNaN(Date.parse(update.confirmed_at))).toBe(false);
    expect(confirm.calls).toContainEqual(["eq", ["kind", "return_key"]]);
    expect(confirm.calls).toContainEqual(["eq", ["key_hash", sealHash()]]);
    expect(confirm.calls).toContainEqual(["is", ["confirmed_at", null]]);
    expect(fromMock).toHaveBeenCalledOnce();
  });

  it("answers true for a key that was already confirmed, without touching its first confirmation", async () => {
    const lookup = query({ data: { id: "key-1" }, error: null });
    mockQueries(query({ data: [], error: null }), lookup);

    await expect(confirmReturnKey(SEAL)).resolves.toBe(true);
    expect(lookup.calls).toContainEqual(["eq", ["kind", "return_key"]]);
    expect(lookup.calls).toContainEqual(["eq", ["key_hash", sealHash()]]);
    expect(lookup.calls.some(([method]) => method === "update")).toBe(false);
  });

  it("answers false for a key that doesn't exist", async () => {
    mockQueries(query({ data: [], error: null }), query({ data: null, error: null }));

    await expect(confirmReturnKey(SEAL)).resolves.toBe(false);
  });

  it("answers false for a malformed key without querying the database", async () => {
    await expect(confirmReturnKey("not-a-key")).resolves.toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the confirmation", [query({ data: null, error: new Error("update failed") })], "update failed"],
    [
      "the lookup after it",
      [query({ data: [], error: null }), query({ data: null, error: new Error("lookup failed") })],
      "lookup failed",
    ],
  ])("throws when %s fails", async (_label, queries, message) => {
    mockQueries(...queries);

    await expect(confirmReturnKey(SEAL)).rejects.toThrow(message);
  });
});

describe("hasConfirmedReturnKey", () => {
  it("looks for a confirmed return key of this identity", async () => {
    const lookup = query({ data: [{ id: "key-1" }], error: null });
    mockQueries(lookup);

    await expect(hasConfirmedReturnKey("identity-1")).resolves.toBe(true);
    expect(fromMock).toHaveBeenCalledWith("identity_keys");
    expect(lookup.calls).toContainEqual(["eq", ["identity_id", "identity-1"]]);
    expect(lookup.calls).toContainEqual(["eq", ["kind", "return_key"]]);
    expect(lookup.calls).toContainEqual(["not", ["confirmed_at", "is", null]]);
  });

  it("answers false when the identity has no confirmed key", async () => {
    mockQueries(query({ data: [], error: null }));

    await expect(hasConfirmedReturnKey("identity-1")).resolves.toBe(false);
  });

  it("throws when the lookup fails", async () => {
    mockQueries(query({ data: null, error: new Error("lookup failed") }));

    await expect(hasConfirmedReturnKey("identity-1")).rejects.toThrow("lookup failed");
  });
});

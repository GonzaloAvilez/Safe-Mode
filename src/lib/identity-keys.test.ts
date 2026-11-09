import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { generateReturnKey, hashReturnKey, isWellFormedReturnKey, createIdentityWithReturnKey, resolveIdentityFromReturnKey } =
  await import("@/lib/identity-keys");

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateReturnKey", () => {
  it("produces a well-formed 43-char base64url key", () => {
    const key = generateReturnKey();
    expect(key).toHaveLength(43);
    expect(isWellFormedReturnKey(key)).toBe(true);
  });

  it("produces a different key every time", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateReturnKey()));
    expect(keys.size).toBe(100);
  });
});

describe("hashReturnKey", () => {
  it("is the hex SHA-256 of the key, and never the key itself", () => {
    const key = generateReturnKey();
    const hash = hashReturnKey(key);
    expect(hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(hash).not.toContain(key);
  });
});

describe("isWellFormedReturnKey", () => {
  it.each(["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, `${"a".repeat(42)}=`])(
    "rejects %j",
    (input) => {
      expect(isWellFormedReturnKey(input)).toBe(false);
    }
  );
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

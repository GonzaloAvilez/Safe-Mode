import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));

const { ABANDONED_IDENTITY_BATCH, ABANDONED_IDENTITY_HOURS, deleteAbandonedIdentities } = await import(
  "@/lib/abandoned-identities"
);

afterEach(() => {
  vi.resetAllMocks();
});

// A Supabase query builder stand-in: every chained method is recorded and returns the same
// object; awaiting it resolves to `result`.
function query(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "delete", "eq", "is", "not", "lt", "in", "order", "limit"]) {
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

const rows = (column: string, ids: string[]) => query({ data: ids.map((id) => ({ [column]: id })), error: null });
const NOW = new Date("2026-11-20T12:00:00.000Z");

describe("deleteAbandonedIdentities", () => {
  it("are a day old and fifty at a time", () => {
    expect(ABANDONED_IDENTITY_HOURS).toBe(24);
    expect(ABANDONED_IDENTITY_BATCH).toBe(50);
  });

  it("looks for unconfirmed seals older than a day, oldest first, fifty at most", async () => {
    const lookup = rows("identity_id", []);
    mockTables({ identity_keys: [lookup] });

    await deleteAbandonedIdentities(NOW);

    expect(lookup.calls).toEqual([
      ["select", ["identity_id"]],
      ["eq", ["kind", "return_key"]],
      ["is", ["confirmed_at", null]],
      ["lt", ["created_at", "2026-11-19T12:00:00.000Z"]],
      ["order", ["created_at"]],
      ["limit", [50]],
    ]);
  });

  it("deletes the seal, then the identity, of one that holds nothing, and says how many", async () => {
    const lookup = rows("identity_id", ["a1"]);
    const confirmed = rows("identity_id", []);
    const deleteKeys = rows("identity_id", ["a1"]);
    const deleteIdentities = rows("id", ["a1"]);
    mockTables({
      identity_keys: [lookup, confirmed, deleteKeys],
      phrases: [rows("identity_id", [])],
      correspondences: [rows("visitor_identity_id", [])],
      identities: [deleteIdentities],
    });

    expect(await deleteAbandonedIdentities(NOW)).toBe(1);
    expect(deleteKeys.calls).toEqual([
      ["delete", []],
      ["in", ["identity_id", ["a1"]]],
      ["eq", ["kind", "return_key"]],
      ["is", ["confirmed_at", null]], // checked again: a seal confirmed meanwhile stays
      ["select", ["identity_id"]],
    ]);
    expect(deleteIdentities.calls).toEqual([
      ["delete", []],
      ["in", ["id", ["a1"]]],
      ["select", ["id"]],
    ]);
  });

  it("keeps identities that hold a phrase, a correspondence or a confirmed seal", async () => {
    const phrases = rows("identity_id", ["author"]);
    const correspondences = rows("visitor_identity_id", ["visitor"]);
    const confirmed = rows("identity_id", ["confirmed"]);
    const deleteKeys = rows("identity_id", ["empty"]);
    mockTables({
      identity_keys: [rows("identity_id", ["author", "visitor", "confirmed", "empty"]), confirmed, deleteKeys],
      phrases: [phrases],
      correspondences: [correspondences],
      identities: [rows("id", ["empty"])],
    });

    expect(await deleteAbandonedIdentities(NOW)).toBe(1);
    expect(phrases.calls).toContainEqual(["in", ["identity_id", ["author", "visitor", "confirmed", "empty"]]]);
    expect(correspondences.calls).toContainEqual(["in", ["visitor_identity_id", ["author", "visitor", "confirmed", "empty"]]]);
    expect(confirmed.calls).toEqual([
      ["select", ["identity_id"]],
      ["in", ["identity_id", ["author", "visitor", "confirmed", "empty"]]],
      ["not", ["confirmed_at", "is", null]],
    ]);
    expect(deleteKeys.calls).toContainEqual(["in", ["identity_id", ["empty"]]]);
  });

  it("deletes only the identities whose seal really went, when one was confirmed between the steps", async () => {
    const deleteIdentities = rows("id", ["a1"]);
    mockTables({
      identity_keys: [rows("identity_id", ["a1", "a2"]), rows("identity_id", []), rows("identity_id", ["a1"])],
      phrases: [rows("identity_id", [])],
      correspondences: [rows("visitor_identity_id", [])],
      identities: [deleteIdentities],
    });

    expect(await deleteAbandonedIdentities(NOW)).toBe(1);
    expect(deleteIdentities.calls).toContainEqual(["in", ["id", ["a1"]]]);
  });

  it("asks about each identity once, even with more than one old seal", async () => {
    const phrases = rows("identity_id", []);
    mockTables({
      identity_keys: [rows("identity_id", ["a1", "a1"]), rows("identity_id", []), rows("identity_id", ["a1", "a1"])],
      phrases: [phrases],
      correspondences: [rows("visitor_identity_id", [])],
      identities: [rows("id", ["a1"])],
    });

    expect(await deleteAbandonedIdentities(NOW)).toBe(1);
    expect(phrases.calls).toContainEqual(["in", ["identity_id", ["a1"]]]);
  });

  it.each([
    ["no old unconfirmed seal", { identity_keys: [rows("identity_id", [])] }],
    [
      "only identities that hold something",
      {
        identity_keys: [rows("identity_id", ["author"]), rows("identity_id", [])],
        phrases: [rows("identity_id", ["author"])],
        correspondences: [rows("visitor_identity_id", [])],
      },
    ],
    [
      "seals all confirmed between the steps",
      {
        identity_keys: [rows("identity_id", ["a1"]), rows("identity_id", []), rows("identity_id", [])],
        phrases: [rows("identity_id", [])],
        correspondences: [rows("visitor_identity_id", [])],
      },
    ],
  ])("deletes nothing, and never reaches identities, with %s", async (_label, tables) => {
    mockTables(tables);

    expect(await deleteAbandonedIdentities(NOW)).toBe(0);
    expect(fromMock).not.toHaveBeenCalledWith("identities");
  });

  it.each([
    ["the lookup", { identity_keys: [query({ data: null, error: { message: "boom" } })] }],
    [
      "the phrases check",
      {
        identity_keys: [rows("identity_id", ["a1"]), rows("identity_id", [])],
        phrases: [query({ data: null, error: { message: "boom" } })],
        correspondences: [rows("visitor_identity_id", [])],
      },
    ],
    [
      "deleting the seals",
      {
        identity_keys: [rows("identity_id", ["a1"]), rows("identity_id", []), query({ data: null, error: { message: "boom" } })],
        phrases: [rows("identity_id", [])],
        correspondences: [rows("visitor_identity_id", [])],
      },
    ],
    [
      "deleting the identities",
      {
        identity_keys: [rows("identity_id", ["a1"]), rows("identity_id", []), rows("identity_id", ["a1"])],
        phrases: [rows("identity_id", [])],
        correspondences: [rows("visitor_identity_id", [])],
        identities: [query({ data: null, error: { message: "boom" } })],
      },
    ],
  ])("throws when %s fails, so the cron run shows as failed", async (_label, tables) => {
    mockTables(tables);

    await expect(deleteAbandonedIdentities(NOW)).rejects.toEqual({ message: "boom" });
  });
});

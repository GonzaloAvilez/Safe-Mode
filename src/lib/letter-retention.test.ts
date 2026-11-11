import { afterEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));

const {
  anonymizeExpiredLetters,
  closeInactiveCorrespondences,
  CORRESPONDENCE_INACTIVITY_DAYS,
  CRISIS_LETTER_RETENTION_DAYS,
  LETTER_RETENTION_DAYS,
} = await import("@/lib/letter-retention");
const { CRISIS_RETENTION_DAYS } = await import("@/lib/crisis-entries");

// resetAllMocks also drops queued mockReturnValueOnce values (see letter-review.test.ts).
afterEach(() => {
  vi.resetAllMocks();
});

// A Supabase query builder stand-in: every chained method is recorded and returns the
// same object; awaiting it resolves to `result`.
function query(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "update", "eq", "neq", "lt", "is", "in", "not", "or"]) {
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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T05:15:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe("retention windows", () => {
  it("are 60 days for letters, 30 for crisis letters (same as crisis entries), 60 for inactivity", () => {
    expect(LETTER_RETENTION_DAYS).toBe(60);
    expect(CRISIS_LETTER_RETENTION_DAYS).toBe(CRISIS_RETENTION_DAYS);
    expect(CRISIS_LETTER_RETENTION_DAYS).toBe(30);
    expect(CORRESPONDENCE_INACTIVITY_DAYS).toBe(60);
  });
});

describe("anonymizeExpiredLetters", () => {
  it("erases crisis letters after 30 days and every other non-held letter after 60, skipping letters without text", async () => {
    const crisis = query({ data: [{ id: "c1" }], error: null });
    const others = query({ data: [{ id: "o1" }, { id: "o2" }], error: null });
    mockQueries(crisis, others);

    expect(await anonymizeExpiredLetters(NOW)).toBe(3);

    const erase = ["update", [{ body: null, anonymized_at: NOW.toISOString() }]];
    expect(crisis.calls).toEqual([
      erase,
      ["eq", ["rejection_reason", "crisis"]],
      ["lt", ["created_at", daysAgo(30)]],
      ["not", ["body", "is", null]],
      ["select", ["id"]],
    ]);
    expect(others.calls).toEqual([
      erase,
      ["neq", ["status", "held"]], // what waits for review is never touched
      ["lt", ["created_at", daysAgo(60)]],
      ["not", ["body", "is", null]],
      ["select", ["id"]],
    ]);
  });

  it.each([
    ["the crisis update", 0],
    ["the general update", 1],
  ])("throws when %s fails", async (_label, failingIndex) => {
    const error = { message: "connection failure" };
    const results = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    results[failingIndex] = { data: null, error } as never;
    mockQueries(query(results[0]), query(results[1]));

    await expect(anonymizeExpiredLetters(NOW)).rejects.toEqual(error);
  });
});

describe("closeInactiveCorrespondences", () => {
  const letter = (status: string, createdDaysAgo: number, deliveredDaysAgo: number | null = null) => ({
    status,
    created_at: daysAgo(createdDaysAgo),
    delivered_at: deliveredDaysAgo === null ? null : daysAgo(deliveredDaysAgo),
  });

  it("closes only open correspondences whose last activity is older than 60 days and that have nothing held", async () => {
    const candidates = query({
      data: [
        { id: "no-letters", created_at: daysAgo(61), letters: [] },
        { id: "all-old", created_at: daysAgo(90), letters: [letter("delivered", 80, 79), letter("rejected", 70)] },
        { id: "recent-letter", created_at: daysAgo(90), letters: [letter("delivered", 80, 79), letter("rejected", 10)] },
        { id: "recent-delivery", created_at: daysAgo(90), letters: [letter("delivered", 61, 59)] },
        { id: "old-held", created_at: daysAgo(90), letters: [letter("held", 70)] },
      ],
      error: null,
    });
    const close = query({ data: [{ id: "no-letters" }, { id: "all-old" }], error: null });
    mockQueries(candidates, close);

    expect(await closeInactiveCorrespondences(NOW)).toBe(2);

    expect(candidates.calls).toEqual([
      ["select", ["id, created_at, letters(status, created_at, delivered_at)"]],
      ["is", ["closed_at", null]],
      ["lt", ["created_at", daysAgo(60)]],
    ]);
    expect(close.calls).toEqual([
      ["update", [{ closed_at: NOW.toISOString() }]],
      ["in", ["id", ["no-letters", "all-old"]]],
      ["is", ["closed_at", null]], // never overwrites an earlier closed_at
      ["select", ["id"]],
    ]);
  });

  it("writes nothing when no correspondence is inactive", async () => {
    mockQueries(query({ data: [{ id: "recent", created_at: daysAgo(61), letters: [letter("delivered", 5, 4)] }], error: null }));

    expect(await closeInactiveCorrespondences(NOW)).toBe(0);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("throws when loading candidates fails", async () => {
    const error = { message: "connection failure" };
    mockQueries(query({ data: null, error }));

    await expect(closeInactiveCorrespondences(NOW)).rejects.toEqual(error);
  });
});

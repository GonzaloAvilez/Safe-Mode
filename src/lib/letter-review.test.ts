import { afterEach, describe, expect, it, vi } from "vitest";
import type { Letter } from "@/lib/letter-lifecycle";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));

const {
  approveLetter,
  countLettersAwaitingReview,
  getReviewUrgency,
  listLettersAwaitingReview,
  rejectLetter,
  REVIEW_PROMISE_HOURS,
  REVIEW_WARNING_HOURS,
} = await import("@/lib/letter-review");

// resetAllMocks, not clearAllMocks: it also drops queued mockReturnValueOnce values, so a
// test that queues a query it never consumes can't leak it into the next test.
afterEach(() => {
  vi.resetAllMocks();
});

// A Supabase query builder stand-in: every chained method is recorded and returns the
// same object; awaiting it (or calling maybeSingle) resolves to `result`.
function query(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const method of ["select", "update", "eq", "is", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

// Queues one query per supabaseAdmin.from() call, in order.
function mockQueries(...queries: ReturnType<typeof query>[]) {
  for (const { builder } of queries) fromMock.mockReturnValueOnce(builder);
}

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-11T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

describe("getReviewUrgency", () => {
  it.each([
    [0, "on_time"],
    [REVIEW_WARNING_HOURS - 0.01, "on_time"],
    [REVIEW_WARNING_HOURS, "due_soon"],
    [REVIEW_PROMISE_HOURS - 0.01, "due_soon"],
    [REVIEW_PROMISE_HOURS, "overdue"],
    [200, "overdue"],
  ])("%sh waiting → %s", (hours, expected) => {
    expect(getReviewUrgency(hoursAgo(hours), NOW)).toBe(expected);
  });
});

describe("approveLetter", () => {
  const delivered = (sender: Letter["sender"]): Letter => ({ sender, status: "delivered" });

  it("delivers a held letter, only if it's still held", async () => {
    const update = query({ data: { correspondence_id: "c1" }, error: null });
    mockQueries(update, query({ data: [delivered("visitor")], error: null }));

    expect(await approveLetter("l1")).toEqual({ ok: true });
    expect(update.calls).toEqual([
      ["update", [{ status: "delivered", delivered_at: expect.any(String) }]],
      ["eq", ["id", "l1"]],
      ["eq", ["status", "held"]],
      ["select", ["correspondence_id"]],
    ]);
  });

  it("answers already_decided when the letter is no longer held (double click)", async () => {
    mockQueries(query({ data: null, error: null }));

    expect(await approveLetter("l1")).toEqual({ ok: false, reason: "already_decided" });
    expect(fromMock).toHaveBeenCalledTimes(1); // never looks at closing
  });

  it("closes the correspondence when this was the 6th delivered letter", async () => {
    const sixDelivered = ["visitor", "author", "visitor", "author", "visitor", "author"].map((sender) =>
      delivered(sender as Letter["sender"])
    );
    const close = query({ error: null });
    mockQueries(query({ data: { correspondence_id: "c1" }, error: null }), query({ data: sixDelivered, error: null }), close);

    expect(await approveLetter("l6")).toEqual({ ok: true });
    expect(close.calls).toEqual([
      ["update", [{ closed_at: expect.any(String) }]],
      ["eq", ["id", "c1"]],
      ["is", ["closed_at", null]], // never overwrites an earlier closed_at
    ]);
  });

  it("doesn't close a correspondence that isn't complete", async () => {
    mockQueries(
      query({ data: { correspondence_id: "c1" }, error: null }),
      query({ data: [delivered("visitor"), delivered("author"), delivered("visitor")], error: null })
    );

    await approveLetter("l3");

    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("still reports the approval as done if closing fails afterwards", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockQueries(
      query({ data: { correspondence_id: "c1" }, error: null }),
      query({ data: null, error: { message: "connection failure" } })
    );

    expect(await approveLetter("l6")).toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("throws when the delivery update itself fails", async () => {
    const error = { message: "connection failure" };
    mockQueries(query({ data: null, error }));

    await expect(approveLetter("l1")).rejects.toEqual(error);
  });
});

describe("rejectLetter", () => {
  it("rejects a held letter with reason 'review', only if it's still held", async () => {
    const update = query({ data: { id: "l1" }, error: null });
    mockQueries(update);

    expect(await rejectLetter("l1")).toEqual({ ok: true });
    expect(update.calls).toEqual([
      ["update", [{ status: "rejected", rejection_reason: "review" }]],
      ["eq", ["id", "l1"]],
      ["eq", ["status", "held"]],
      ["select", ["id"]],
    ]);
  });

  it("answers already_decided when the letter is no longer held", async () => {
    mockQueries(query({ data: null, error: null }));

    expect(await rejectLetter("l1")).toEqual({ ok: false, reason: "already_decided" });
  });

  it("throws on a database error", async () => {
    const error = { message: "connection failure" };
    mockQueries(query({ data: null, error }));

    await expect(rejectLetter("l1")).rejects.toEqual(error);
  });
});

describe("listLettersAwaitingReview", () => {
  it("returns each held letter with its phrase and the delivered letters, oldest first, and no ids beyond the letter's", async () => {
    const list = query({
      data: [
        {
          id: "l3",
          sender: "visitor",
          body: "Mi segunda carta",
          created_at: "2026-11-11T10:00:00Z",
          correspondences: {
            phrases: { text: "Me siento invisible" },
            letters: [
              { sender: "author", body: "Gracias a ti", status: "delivered", delivered_at: "2026-11-10T09:00:00Z" },
              { sender: "visitor", body: "Mi segunda carta", status: "held", delivered_at: null },
              { sender: "visitor", body: null, status: "delivered", delivered_at: "2026-11-09T09:00:00Z" },
              { sender: "visitor", body: "Con un teléfono", status: "rejected", delivered_at: null },
            ],
          },
        },
      ],
      error: null,
    });
    mockQueries(list);

    const letters = await listLettersAwaitingReview();

    expect(letters).toEqual([
      {
        id: "l3",
        sender: "visitor",
        body: "Mi segunda carta",
        createdAt: "2026-11-11T10:00:00Z",
        phraseText: "Me siento invisible",
        deliveredLetters: [
          { sender: "visitor", body: null, deliveredAt: "2026-11-09T09:00:00Z" }, // anonymized
          { sender: "author", body: "Gracias a ti", deliveredAt: "2026-11-10T09:00:00Z" },
        ],
      },
    ]);
    expect(list.calls).toContainEqual(["eq", ["status", "held"]]);
    expect(list.calls).toContainEqual(["order", ["created_at", { ascending: true }]]);
  });

  it("throws on a database error", async () => {
    const error = { message: "connection failure" };
    mockQueries(query({ data: null, error }));

    await expect(listLettersAwaitingReview()).rejects.toEqual(error);
  });
});

describe("countLettersAwaitingReview", () => {
  it.each([
    [3, 3],
    [null, 0],
  ])("count %s → %s", async (count, expected) => {
    mockQueries(query({ count, error: null }));

    expect(await countLettersAwaitingReview()).toBe(expected);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { LetterSender, LetterStatus } from "@/lib/letter-lifecycle";

const { fromMock, resolveIdentityFromReturnKeyMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  resolveIdentityFromReturnKeyMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock("@/lib/identity-keys", () => ({ resolveIdentityFromReturnKey: resolveIdentityFromReturnKeyMock }));

const { getMailbox, getMailboxState, getMailboxWithReturnKey, isCorrespondenceVisibleTo, isLetterVisibleTo } =
  await import("@/lib/mailbox");

afterEach(() => {
  vi.resetAllMocks();
});

type RejectionReason = "crisis" | "moderation" | "contact_info" | "review";

describe("isLetterVisibleTo", () => {
  const facts = (sender: LetterSender, status: LetterStatus, rejectionReason: RejectionReason | null = null) => ({
    sender,
    status,
    rejectionReason,
  });

  it.each([
    // Delivered letters, from either side.
    ["your delivered letter", facts("author", "delivered"), true],
    ["their delivered letter", facts("visitor", "delivered"), true],
    // Yours, still on its way or rejected in review: only the mailbox can tell you.
    ["your letter in review", facts("author", "held"), true],
    ["your letter rejected in review", facts("author", "rejected", "review"), true],
    // Theirs, not delivered: you never hear of a letter that may never arrive.
    ["their letter in review", facts("visitor", "held"), false],
    ["their letter rejected in review", facts("visitor", "rejected", "review"), false],
    ["their letter rejected for crisis", facts("visitor", "rejected", "crisis"), false],
    // Yours, rejected when you sent it: already answered then.
    ["your letter rejected for crisis", facts("author", "rejected", "crisis"), false],
    ["your letter rejected by moderation", facts("author", "rejected", "moderation"), false],
    ["your letter rejected for contact info", facts("author", "rejected", "contact_info"), false],
    // Never stored (the pipeline runs before insert), but the rule doesn't show them either.
    ["your draft", facts("author", "draft"), false],
    ["your letter being moderated", facts("author", "moderating"), false],
  ])("to the author: %s → %s", (_label, letter, expected) => {
    expect(isLetterVisibleTo(letter, "author")).toBe(expected);
  });

  it("applies the same rule from the visitor's side", () => {
    expect(isLetterVisibleTo(facts("visitor", "held"), "visitor")).toBe(true);
    expect(isLetterVisibleTo(facts("author", "held"), "visitor")).toBe(false);
    expect(isLetterVisibleTo(facts("visitor", "rejected", "review"), "visitor")).toBe(true);
    expect(isLetterVisibleTo(facts("author", "rejected", "review"), "visitor")).toBe(false);
  });
});

describe("isCorrespondenceVisibleTo", () => {
  const letters = (...statuses: LetterStatus[]) => statuses.map((status) => ({ status }));

  it.each([
    ["visitor", letters(), true],
    ["visitor", letters("rejected"), true], // they started it, and can retry
    ["visitor", letters("held"), true],
    ["author", letters(), false],
    ["author", letters("held"), false], // nothing has reached them yet
    ["author", letters("rejected"), false],
    ["author", letters("rejected", "held"), false],
    ["author", letters("delivered"), true],
    ["author", letters("delivered", "held"), true],
  ] as const)("%s, letters %j → %s", (side, stored, expected) => {
    expect(isCorrespondenceVisibleTo(stored, side)).toBe(expected);
  });
});

describe("getMailboxState", () => {
  const letter = (sender: LetterSender, status: LetterStatus) => ({ sender, status });
  const delivered = (sender: LetterSender) => letter(sender, "delivered");

  it.each([
    ["no letters yet", [], "your_turn", "their_turn"],
    ["the first letter rejected", [letter("visitor", "rejected")], "your_turn", "their_turn"],
    ["the visitor's letter in review", [letter("visitor", "held")], "awaiting_review", "their_turn"],
    ["the visitor's letter delivered", [delivered("visitor")], "their_turn", "your_turn"],
    [
      "the author's reply in review",
      [delivered("visitor"), letter("author", "held")],
      "their_turn",
      "awaiting_review",
    ],
    ["one letter delivered each way", [delivered("visitor"), delivered("author")], "your_turn", "their_turn"],
    [
      "all 6 letters delivered",
      [delivered("visitor"), delivered("author"), delivered("visitor"), delivered("author"), delivered("visitor"), delivered("author")],
      "closed",
      "closed",
    ],
  ] as const)("%s → visitor sees %s, author sees %s", (_label, letters, visitorSees, authorSees) => {
    const correspondence = { letters, closedAt: null };

    expect(getMailboxState(correspondence, "visitor")).toBe(visitorSees);
    expect(getMailboxState(correspondence, "author")).toBe(authorSees);
  });

  it("is closed for both sides once closed_at is set (60 days without activity)", () => {
    const correspondence = { letters: [delivered("visitor")], closedAt: "2026-11-01T00:00:00.000Z" };

    expect(getMailboxState(correspondence, "visitor")).toBe("closed");
    expect(getMailboxState(correspondence, "author")).toBe("closed");
  });
});

// ---------------------------------------------------------------------------------------
// Reading from the database
// ---------------------------------------------------------------------------------------

type LetterRow = {
  sender: LetterSender;
  status: LetterStatus;
  rejection_reason: RejectionReason | null;
  body: string | null;
  created_at: string;
  delivered_at: string | null;
};

const letterRow = (
  sender: LetterSender,
  status: LetterStatus,
  createdAt: string,
  extra: Partial<LetterRow> = {}
): LetterRow => ({
  sender,
  status,
  rejection_reason: null,
  body: `${sender} ${status} ${createdAt}`,
  created_at: createdAt,
  delivered_at: status === "delivered" ? createdAt.replace("T10", "T20") : null,
  ...extra,
});

const correspondenceRow = (id: string, createdAt: string, letters: LetterRow[], closedAt: string | null = null) => ({
  id,
  created_at: createdAt,
  closed_at: closedAt,
  phrases: { text: `frase de ${id}` },
  letters,
});

// Both queries go to correspondences at once (Promise.all); each is answered by what it
// filters on, so the test doesn't depend on which one runs first.
function mockCorrespondences({
  asVisitor = [],
  asAuthor = [],
  failing,
}: {
  asVisitor?: unknown[];
  asAuthor?: unknown[];
  failing?: { side: LetterSender; error: unknown };
}) {
  const queries: [string, unknown[]][][] = [];
  fromMock.mockImplementation((table: string) => {
    if (table !== "correspondences") throw new Error(`unexpected query on ${table}`);
    const calls: [string, unknown[]][] = [];
    queries.push(calls);
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const isAuthorQuery = calls.some(([method, args]) => method === "eq" && args[0] === "phrases.identity_id");
        const side: LetterSender = isAuthorQuery ? "author" : "visitor";
        const result =
          failing?.side === side
            ? { data: null, error: failing.error }
            : { data: isAuthorQuery ? asAuthor : asVisitor, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    for (const method of ["select", "eq"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return builder;
      };
    }
    return builder;
  });
  return queries;
}

describe("getMailbox", () => {
  it("looks the identity up as visitor and, through the phrase's author, as author", async () => {
    const queries = mockCorrespondences({});

    await getMailbox("identity-1");

    expect(queries).toHaveLength(2);
    const [visitorQuery, authorQuery] = queries;
    expect(visitorQuery).toContainEqual(["eq", ["visitor_identity_id", "identity-1"]]);
    expect(authorQuery).toContainEqual(["eq", ["phrases.identity_id", "identity-1"]]);
    // Without !inner, the author filter would keep every correspondence with an empty phrase.
    expect(String(authorQuery.find(([method]) => method === "select")![1][0])).toContain("phrases!inner(text)");
  });

  it("returns the visitor's correspondence from their side, with exactly the fields the mailbox promises", async () => {
    const delivered = letterRow("visitor", "delivered", "2026-11-10T10:00:00.000Z");
    mockCorrespondences({ asVisitor: [correspondenceRow("c1", "2026-11-10T09:00:00.000Z", [delivered])] });

    expect(await getMailbox("identity-1")).toEqual({
      correspondences: [
        {
          id: "c1",
          yourSide: "visitor",
          state: "their_turn",
          phraseText: "frase de c1",
          letters: [
            {
              sender: "visitor",
              status: "delivered",
              body: delivered.body,
              createdAt: "2026-11-10T10:00:00.000Z",
              deliveredAt: "2026-11-10T20:00:00.000Z",
            },
          ],
        },
      ],
    });
  });

  it("hides the other side's letter in review, but still lets it decide that nobody can write", async () => {
    mockCorrespondences({
      asVisitor: [
        correspondenceRow("c1", "2026-11-10T09:00:00.000Z", [
          letterRow("visitor", "delivered", "2026-11-10T10:00:00.000Z"),
          letterRow("author", "held", "2026-11-11T10:00:00.000Z"),
        ]),
      ],
    });

    const [correspondence] = (await getMailbox("identity-1")).correspondences;

    expect(correspondence.letters.map((letter) => [letter.sender, letter.status])).toEqual([["visitor", "delivered"]]);
    expect(correspondence.state).toBe("their_turn");
  });

  it("shows your own letters in review and rejected in review, but not the ones rejected on sending", async () => {
    mockCorrespondences({
      asVisitor: [
        correspondenceRow("c1", "2026-11-10T09:00:00.000Z", [
          letterRow("visitor", "rejected", "2026-11-10T10:00:00.000Z", { rejection_reason: "contact_info", body: null }),
          letterRow("visitor", "rejected", "2026-11-11T10:00:00.000Z", { rejection_reason: "review" }),
          letterRow("visitor", "held", "2026-11-12T10:00:00.000Z"),
        ]),
      ],
    });

    const [correspondence] = (await getMailbox("identity-1")).correspondences;

    expect(correspondence.letters.map((letter) => [letter.status, letter.createdAt])).toEqual([
      ["rejected", "2026-11-11T10:00:00.000Z"],
      ["held", "2026-11-12T10:00:00.000Z"],
    ]);
    expect(correspondence.state).toBe("awaiting_review");
  });

  it("keeps a letter whose text retention already erased, with body null", async () => {
    mockCorrespondences({
      asVisitor: [
        correspondenceRow("c1", "2026-09-01T09:00:00.000Z", [
          letterRow("visitor", "delivered", "2026-09-01T10:00:00.000Z", { body: null }),
        ]),
      ],
    });

    const [correspondence] = (await getMailbox("identity-1")).correspondences;

    expect(correspondence.letters).toHaveLength(1);
    expect(correspondence.letters[0].body).toBeNull();
  });

  it("shows the author only the correspondences where a letter has reached them", async () => {
    mockCorrespondences({
      asAuthor: [
        correspondenceRow("in-review", "2026-11-12T09:00:00.000Z", [letterRow("visitor", "held", "2026-11-12T10:00:00.000Z")]),
        correspondenceRow("rejected", "2026-11-11T09:00:00.000Z", [
          letterRow("visitor", "rejected", "2026-11-11T10:00:00.000Z", { rejection_reason: "moderation" }),
        ]),
        correspondenceRow("delivered", "2026-11-10T09:00:00.000Z", [
          letterRow("visitor", "delivered", "2026-11-10T10:00:00.000Z"),
        ]),
      ],
    });

    const { correspondences } = await getMailbox("identity-1");

    expect(correspondences.map(({ id, yourSide, state }) => [id, yourSide, state])).toEqual([
      ["delivered", "author", "your_turn"],
    ]);
  });

  it("lists the newest correspondence first, across both sides, and letters oldest first", async () => {
    mockCorrespondences({
      asVisitor: [correspondenceRow("visitor-mid", "2026-11-05T09:00:00.000Z", [])],
      asAuthor: [
        correspondenceRow("author-old", "2026-11-01T09:00:00.000Z", [
          // Out of order on purpose: the database doesn't promise any order for embedded rows.
          letterRow("author", "delivered", "2026-11-03T10:00:00.000Z"),
          letterRow("visitor", "delivered", "2026-11-01T10:00:00.000Z"),
          letterRow("visitor", "held", "2026-11-04T10:00:00.000Z"),
        ]),
        correspondenceRow("author-new", "2026-11-09T09:00:00.000Z", [
          letterRow("visitor", "delivered", "2026-11-09T10:00:00.000Z"),
        ]),
      ],
    });

    const { correspondences } = await getMailbox("identity-1");

    expect(correspondences.map(({ id }) => id)).toEqual(["author-new", "visitor-mid", "author-old"]);
    expect(correspondences[2].letters.map(({ createdAt }) => createdAt)).toEqual([
      "2026-11-01T10:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ]);
  });

  it("returns an empty mailbox when the identity takes part in nothing yet", async () => {
    mockCorrespondences({});

    expect(await getMailbox("identity-1")).toEqual({ correspondences: [] });
  });

  // Each lookup on its own: a partial mailbox would look like letters had disappeared.
  it.each(["visitor", "author"] as const)("throws when the lookup as %s fails, even if the other works", async (side) => {
    const error = { message: "connection failure" };
    mockCorrespondences({
      asVisitor: [correspondenceRow("c1", "2026-11-10T09:00:00.000Z", [])],
      failing: { side, error },
    });

    await expect(getMailbox("identity-1")).rejects.toEqual(error);
  });
});

describe("getMailboxWithReturnKey", () => {
  it("reads the mailbox of the identity the key belongs to", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue("identity-1");
    const queries = mockCorrespondences({});

    expect(await getMailboxWithReturnKey("the-key")).toEqual({ correspondences: [] });
    expect(resolveIdentityFromReturnKeyMock).toHaveBeenCalledWith("the-key");
    expect(queries[0]).toContainEqual(["eq", ["visitor_identity_id", "identity-1"]]);
  });

  it("returns null for a key that belongs to nobody, without reading any correspondence", async () => {
    resolveIdentityFromReturnKeyMock.mockResolvedValue(null);

    expect(await getMailboxWithReturnKey("unknown-key")).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

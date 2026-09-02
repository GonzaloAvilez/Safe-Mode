import { afterEach, describe, expect, it, vi } from "vitest";

const { orderMock, activeEqMock, languageEqMock, fromMock, inMock, resonanceSelectMock, isResonateEnabledMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const languageEqMock = vi.fn(() => ({ order: orderMock }));
  const activeEqMock = vi.fn(() => ({ eq: languageEqMock }));
  const phrasesSelectMock = vi.fn(() => ({ eq: activeEqMock }));

  const inMock = vi.fn();
  const resonanceSelectMock = vi.fn(() => ({ in: inMock }));

  const fromMock = vi.fn((table: string) => {
    if (table === "phrase_resonances") return { select: resonanceSelectMock };
    return { select: phrasesSelectMock };
  });

  return {
    orderMock,
    activeEqMock,
    languageEqMock,
    fromMock,
    inMock,
    resonanceSelectMock,
    isResonateEnabledMock: vi.fn().mockResolvedValue(false),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/settings", () => ({
  isResonateEnabled: isResonateEnabledMock,
}));

const { GET } = await import("@/app/api/observe/route");

afterEach(() => {
  vi.clearAllMocks();
  isResonateEnabledMock.mockResolvedValue(false);
});

describe("GET /api/observe", () => {
  it("returns 500 with the error message when the query fails", async () => {
    orderMock.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "connection refused" });
  });

  it("drops active rows with a null embedding instead of crashing", async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        { id: "1", text: "has embedding", embedding: [1, 0] },
        { id: "2", text: "missing embedding", embedding: null },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.phrases).toEqual([{ id: "1", text: "has embedding" }]);
    expect(body.similarities).toEqual([[0]]);
  });

  it("parses embeddings whether pgvector returns a real array or a JSON string", async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        { id: "1", text: "array form", embedding: [1, 0] },
        { id: "2", text: "string form", embedding: "[1,0]" },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    // Identical vectors in either form -> cosine similarity 1.
    expect(body.similarities[0][1]).toBeCloseTo(1);
    expect(body.similarities[1][0]).toBeCloseTo(1);
  });

  it("computes a symmetric pairwise similarity matrix with a zero diagonal", async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        { id: "1", text: "right", embedding: [1, 0] },
        { id: "2", text: "up", embedding: [0, 1] },
        { id: "3", text: "also right", embedding: [1, 0] },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.similarities[0][0]).toBe(0);
    expect(body.similarities[1][1]).toBe(0);
    expect(body.similarities[2][2]).toBe(0);
    // Orthogonal vectors -> similarity 0.
    expect(body.similarities[0][1]).toBeCloseTo(0);
    expect(body.similarities[1][0]).toBeCloseTo(0);
    // Identical direction -> similarity 1.
    expect(body.similarities[0][2]).toBeCloseTo(1);
    expect(body.similarities[2][0]).toBeCloseTo(1);
  });

  it("never sends embeddings back to the client, only id/text", async () => {
    orderMock.mockResolvedValueOnce({
      data: [{ id: "1", text: "some phrase", embedding: [1, 0] }],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.phrases[0]).toEqual({ id: "1", text: "some phrase" });
    expect(body.phrases[0]).not.toHaveProperty("embedding");
  });

  it("defaults legacy requests to English and filters the corpus", async () => {
    orderMock.mockResolvedValueOnce({ data: [], error: null });

    await GET();

    expect(fromMock).toHaveBeenCalledWith("phrases");
    expect(activeEqMock).toHaveBeenCalledWith("active", true);
    expect(languageEqMock).toHaveBeenCalledWith("language", "en");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("filters by an explicit supported locale and rejects unsupported locales", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    const spanish = await GET(new Request("http://localhost/api/observe?locale=es"));
    const unsupported = await GET(new Request("http://localhost/api/observe?locale=fr"));

    expect(spanish.status).toBe(200);
    expect(languageEqMock).toHaveBeenCalledWith("language", "es");
    expect(unsupported.status).toBe(400);
    expect(orderMock).toHaveBeenCalledTimes(1);
  });

  describe("resonanceCount (gated by isResonateEnabled)", () => {
    it("never queries phrase_resonances and omits resonanceCount when the flag is off", async () => {
      isResonateEnabledMock.mockResolvedValueOnce(false);
      orderMock.mockResolvedValueOnce({
        data: [{ id: "1", text: "some phrase", embedding: [1, 0] }],
        error: null,
      });

      const response = await GET();
      const body = await response.json();

      expect(resonanceSelectMock).not.toHaveBeenCalled();
      expect(body.phrases[0]).not.toHaveProperty("resonanceCount");
    });

    it("attaches the real count per phrase when the flag is on", async () => {
      isResonateEnabledMock.mockResolvedValueOnce(true);
      orderMock.mockResolvedValueOnce({
        data: [
          { id: "1", text: "resonated twice", embedding: [1, 0] },
          { id: "2", text: "never resonated", embedding: [0, 1] },
        ],
        error: null,
      });
      inMock.mockResolvedValueOnce({
        data: [{ phrase_id: "1" }, { phrase_id: "1" }],
        error: null,
      });

      const response = await GET();
      const body = await response.json();

      expect(inMock).toHaveBeenCalledWith("phrase_id", ["1", "2"]);
      expect(body.phrases).toEqual([
        { id: "1", text: "resonated twice", resonanceCount: 2 },
        { id: "2", text: "never resonated", resonanceCount: 0 },
      ]);
    });

    it("skips the phrase_resonances query entirely when there are no active phrases", async () => {
      isResonateEnabledMock.mockResolvedValueOnce(true);
      orderMock.mockResolvedValueOnce({ data: [], error: null });

      await GET();

      expect(resonanceSelectMock).not.toHaveBeenCalled();
    });
  });
});

import { describe, expect, it, vi } from "vitest";

const { orderMock, eqMock, fromMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const eqMock = vi.fn(() => ({ order: orderMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { orderMock, eqMock, fromMock };
});

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

const { GET } = await import("@/app/api/observe/route");

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

  it("queries only active phrases, ordered by created_at ascending", async () => {
    orderMock.mockResolvedValueOnce({ data: [], error: null });

    await GET();

    expect(fromMock).toHaveBeenCalledWith("phrases");
    expect(eqMock).toHaveBeenCalledWith("active", true);
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
  });
});

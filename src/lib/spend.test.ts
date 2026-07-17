import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dailySpendExistingRowFixture,
  dailySpendNoRowFixture,
  dailySpendQueryErrorFixture,
  incrementDailySpendErrorFixture,
  incrementDailySpendSuccessFixture,
} from "@/test/fixtures/supabase-responses";

const { fromMock, selectMock, eqMock, maybeSingleMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

const { getTodaysSpendUsd, canSpendToday, recordEmbeddingSpend } = await import("@/lib/spend");

function setUpSelectChain() {
  fromMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
}

const TODAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

afterEach(() => {
  vi.clearAllMocks();
});

describe("getTodaysSpendUsd", () => {
  it("queries daily_spend filtered by today's date", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce(dailySpendNoRowFixture);

    await getTodaysSpendUsd();

    expect(fromMock).toHaveBeenCalledWith("daily_spend");
    expect(eqMock).toHaveBeenCalledWith("date", expect.stringMatching(TODAY_PATTERN));
  });

  it("returns the existing total_usd when a row exists for today", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce(dailySpendExistingRowFixture);

    const result = await getTodaysSpendUsd();

    expect(result).toBe(dailySpendExistingRowFixture.data.total_usd);
  });

  it("returns 0 when no row exists yet for today", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce(dailySpendNoRowFixture);

    const result = await getTodaysSpendUsd();

    expect(result).toBe(0);
  });

  it("throws when the query fails", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce(dailySpendQueryErrorFixture);

    await expect(getTodaysSpendUsd()).rejects.toThrow("query failed");
  });
});

describe("canSpendToday", () => {
  it("returns true when today's spend plus the estimate stays within the cap", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce(dailySpendExistingRowFixture); // total_usd: 1.5

    const result = await canSpendToday(0.5);

    expect(result).toBe(true);
  });

  it("returns false when today's spend plus the estimate would exceed the cap", async () => {
    setUpSelectChain();
    maybeSingleMock.mockResolvedValueOnce({ data: { total_usd: 4.99 }, error: null });

    const result = await canSpendToday(0.5);

    expect(result).toBe(false);
  });
});

describe("recordEmbeddingSpend", () => {
  it("calls increment_daily_spend with today's date and the cost computed from token count", async () => {
    rpcMock.mockResolvedValueOnce(incrementDailySpendSuccessFixture);

    await recordEmbeddingSpend(200);

    expect(rpcMock).toHaveBeenCalledWith("increment_daily_spend", {
      spend_date: expect.stringMatching(TODAY_PATTERN),
      amount_usd: expect.any(Number),
      tokens: 200,
    });
  });

  it("throws when the RPC call fails", async () => {
    rpcMock.mockResolvedValueOnce(incrementDailySpendErrorFixture);

    await expect(recordEmbeddingSpend(200)).rejects.toThrow("rpc failed");
  });
});

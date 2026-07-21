import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
  generalFlaggedModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import { embeddingResultFixture } from "@/test/fixtures/embedding-result";
import { phraseMatchFixture } from "@/test/fixtures/phrase-match";
import { insertEntryErrorFixture, insertEntrySuccessFixture } from "@/test/fixtures/supabase-responses";

const TEST_SESSION_ID = "session-1";

const {
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  moderateTextMock,
  getEmbeddingMock,
  canSpendTodayMock,
  recordEmbeddingSpendMock,
  findClosestPhraseMock,
  createResponseMock,
  insertCrisisContentMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  moderateTextMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
  canSpendTodayMock: vi.fn(),
  recordEmbeddingSpendMock: vi.fn(),
  findClosestPhraseMock: vi.fn(),
  createResponseMock: vi.fn(),
  insertCrisisContentMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/openai", () => ({
  moderateText: moderateTextMock,
  getEmbedding: getEmbeddingMock,
}));

vi.mock("@/lib/spend", () => ({
  canSpendToday: canSpendTodayMock,
  recordEmbeddingSpend: recordEmbeddingSpendMock,
}));

vi.mock("@/lib/phrases", () => ({
  findClosestPhrase: findClosestPhraseMock,
}));

vi.mock("@/lib/responses", () => ({
  createResponse: createResponseMock,
}));

vi.mock("@/lib/crisis-entries", () => ({
  insertCrisisContent: insertCrisisContentMock,
}));

const { submitEntry } = await import("@/lib/entries");

function setUpInsertChain() {
  fromMock.mockReturnValue({ insert: insertMock });
  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
  singleMock.mockResolvedValue(insertEntrySuccessFixture);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("submitEntry — crisis route", () => {
  it("saves the entry as flagged_crisis with no embedding, and skips the spend cap check entirely", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);

    const result = await submitEntry("texto de crisis", TEST_SESSION_ID);

    expect(result).toEqual({ type: "crisis", entryId: insertEntrySuccessFixture.data.id });
    expect(insertMock).toHaveBeenCalledWith({
      text: null,
      flagged_crisis: true,
      flagged_general: false,
      embedding: null,
    });
    expect(insertCrisisContentMock).toHaveBeenCalledWith(
      insertEntrySuccessFixture.data.id,
      "texto de crisis"
    );
    expect(canSpendTodayMock).not.toHaveBeenCalled();
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });

  it("propagates the error when saving the isolated crisis content fails", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);
    insertCrisisContentMock.mockRejectedValueOnce(new Error("insert failed"));

    await expect(submitEntry("texto de crisis", TEST_SESSION_ID)).rejects.toThrow("insert failed");
  });
});

describe("submitEntry — general_flagged route", () => {
  it("saves the entry as flagged_general with no embedding, and skips the spend cap check", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(generalFlaggedModerationCheckFixture);

    const result = await submitEntry("texto violento", TEST_SESSION_ID);

    expect(result).toEqual({ type: "general_flagged", entryId: insertEntrySuccessFixture.data.id });
    expect(insertMock).toHaveBeenCalledWith({
      text: "texto violento",
      flagged_crisis: false,
      flagged_general: true,
      embedding: null,
    });
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });
});

describe("submitEntry — cap_reached route", () => {
  it("saves the entry with no embedding when moderation is clean but the daily cap blocks it", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    canSpendTodayMock.mockResolvedValueOnce(false);

    const result = await submitEntry("un dia normal", TEST_SESSION_ID);

    expect(result).toEqual({ type: "cap_reached", entryId: insertEntrySuccessFixture.data.id });
    expect(canSpendTodayMock).toHaveBeenCalled();
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });
});

describe("submitEntry — proceed route", () => {
  it("computes the embedding, records its real cost, and saves the entry with the embedding", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    findClosestPhraseMock.mockResolvedValueOnce(null);
    createResponseMock.mockResolvedValueOnce({ id: "response-1" });

    await submitEntry("un dia normal", TEST_SESSION_ID);

    expect(recordEmbeddingSpendMock).toHaveBeenCalledWith(embeddingResultFixture.totalTokens);
    expect(insertMock).toHaveBeenCalledWith({
      text: "un dia normal",
      flagged_crisis: false,
      flagged_general: false,
      embedding: embeddingResultFixture.embedding,
    });
    expect(findClosestPhraseMock).toHaveBeenCalledWith(embeddingResultFixture.embedding, "en");
  });

  it("creates a response with the entry id, session id, and the given scaleBefore", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    findClosestPhraseMock.mockResolvedValueOnce(null);
    createResponseMock.mockResolvedValueOnce({ id: "response-1" });

    await submitEntry("un dia normal", TEST_SESSION_ID, 4);

    expect(createResponseMock).toHaveBeenCalledWith(
      insertEntrySuccessFixture.data.id,
      TEST_SESSION_ID,
      4
    );
  });

  it("returns 'matched' with the phrase when the corpus has a close match", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    findClosestPhraseMock.mockResolvedValueOnce(phraseMatchFixture);
    createResponseMock.mockResolvedValueOnce({ id: "response-1" });

    const result = await submitEntry("un dia normal", TEST_SESSION_ID);

    expect(result).toEqual({
      type: "matched",
      entryId: insertEntrySuccessFixture.data.id,
      phrase: phraseMatchFixture,
    });
  });

  it("returns 'no_match' when the corpus has no active phrases yet", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    findClosestPhraseMock.mockResolvedValueOnce(null);
    createResponseMock.mockResolvedValueOnce({ id: "response-1" });

    const result = await submitEntry("un dia normal", TEST_SESSION_ID);

    expect(result).toEqual({ type: "no_match", entryId: insertEntrySuccessFixture.data.id });
  });
});

describe("submitEntry — failures", () => {
  it("throws when inserting the entry fails", async () => {
    setUpInsertChain();
    singleMock.mockReset();
    singleMock.mockResolvedValueOnce(insertEntryErrorFixture);
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);

    await expect(submitEntry("texto de crisis", TEST_SESSION_ID)).rejects.toThrow("insert failed");
  });
});

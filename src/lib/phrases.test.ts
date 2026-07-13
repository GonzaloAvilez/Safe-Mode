import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import { embeddingResultFixture } from "@/test/fixtures/embedding-result";
import {
  insertPhraseErrorFixture,
  insertPhraseSuccessFixture,
  matchPhraseErrorFixture,
  matchPhraseFoundFixture,
  matchPhraseNoneFoundFixture,
  selectPhraseAlreadyEmbeddedFixture,
  selectPhraseErrorFixture,
  selectPhraseNeedsEmbeddingFixture,
  selectPhraseNotApprovedFixture,
  updateErrorFixture,
  updateSuccessFixture,
} from "@/test/fixtures/supabase-responses";

const {
  fromMock,
  insertMock,
  insertSelectMock,
  singleMock,
  updateMock,
  eqMock,
  fetchSelectMock,
  fetchEqMock,
  fetchSingleMock,
  rpcMock,
  moderateTextMock,
  getEmbeddingMock,
  canSpendTodayMock,
  recordEmbeddingSpendMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  fetchSelectMock: vi.fn(),
  fetchEqMock: vi.fn(),
  fetchSingleMock: vi.fn(),
  rpcMock: vi.fn(),
  moderateTextMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
  canSpendTodayMock: vi.fn(),
  recordEmbeddingSpendMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

vi.mock("@/lib/openai", () => ({
  moderateText: moderateTextMock,
  getEmbedding: getEmbeddingMock,
}));

vi.mock("@/lib/spend", () => ({
  canSpendToday: canSpendTodayMock,
  recordEmbeddingSpend: recordEmbeddingSpendMock,
}));

const {
  submitUserPhrase,
  finalizeUserPhraseModeration,
  setPhraseActive,
  approvePhrase,
  rejectPhrase,
  findClosestPhrase,
} = await import("@/lib/phrases");

// insert().select().single() chain, for submitUserPhrase
function setUpInsertChain() {
  fromMock.mockReturnValue({ insert: insertMock, update: updateMock, select: fetchSelectMock });
  insertMock.mockReturnValue({ select: insertSelectMock });
  insertSelectMock.mockReturnValue({ single: singleMock });
  updateMock.mockReturnValue({ eq: eqMock });
}

// select().eq().single() chain, for setPhraseActive's pre-activation fetch
function setUpFetchChain() {
  fromMock.mockReturnValue({ insert: insertMock, update: updateMock, select: fetchSelectMock });
  updateMock.mockReturnValue({ eq: eqMock });
  fetchSelectMock.mockReturnValue({ eq: fetchEqMock });
  fetchEqMock.mockReturnValue({ single: fetchSingleMock });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("submitUserPhrase", () => {
  it("inserts the phrase with source='user', relying on table defaults for moderation state", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertPhraseSuccessFixture);

    await submitUserPhrase("una frase anonima");

    expect(fromMock).toHaveBeenCalledWith("phrases");
    expect(insertMock).toHaveBeenCalledWith({ text: "una frase anonima", source: "user" });
  });

  it("returns the id of the inserted phrase", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertPhraseSuccessFixture);

    const result = await submitUserPhrase("una frase anonima");

    expect(result).toEqual({ id: insertPhraseSuccessFixture.data.id });
  });

  it("throws when the insert fails", async () => {
    setUpInsertChain();
    singleMock.mockResolvedValueOnce(insertPhraseErrorFixture);

    await expect(submitUserPhrase("una frase anonima")).rejects.toThrow("insert failed");
  });
});

describe("finalizeUserPhraseModeration", () => {
  it("moderates the given text", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);
    fetchSingleMock.mockResolvedValueOnce(selectPhraseAlreadyEmbeddedFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "una frase anonima");

    expect(moderateTextMock).toHaveBeenCalledWith("una frase anonima");
  });

  it("approves and activates the phrase organically when moderation does not flag it", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // moderation_status update
    fetchSingleMock.mockResolvedValueOnce(selectPhraseAlreadyEmbeddedFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // active update

    await finalizeUserPhraseModeration("phrase-1", "una frase anonima");

    expect(fromMock).toHaveBeenCalledWith("phrases");
    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "approved" });
    expect(updateMock).toHaveBeenCalledWith({ active: true });
    expect(eqMock).toHaveBeenCalledWith("id", "phrase-1");
  });

  it("computes an embedding as part of the automatic approval when one doesn't exist yet", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNeedsEmbeddingFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "una frase anonima");

    expect(recordEmbeddingSpendMock).toHaveBeenCalledWith(embeddingResultFixture.totalTokens);
    expect(updateMock).toHaveBeenCalledWith({ active: true, embedding: embeddingResultFixture.embedding });
  });

  it("approves but leaves the phrase inactive, without throwing, when the daily spend cap is reached", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNeedsEmbeddingFixture);
    canSpendTodayMock.mockResolvedValueOnce(false);

    await expect(finalizeUserPhraseModeration("phrase-1", "una frase anonima")).resolves.toBeUndefined();
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });

  it("rejects the phrase, without attempting to activate, when moderation flags it", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "texto preocupante");

    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "rejected" });
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });

  it("throws when the moderation_status update fails", async () => {
    setUpFetchChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateErrorFixture);

    await expect(finalizeUserPhraseModeration("phrase-1", "una frase anonima")).rejects.toThrow("update failed");
  });

  it("propagates the error when the moderation call itself fails", async () => {
    setUpFetchChain();
    moderateTextMock.mockRejectedValueOnce(new Error("network error"));

    await expect(finalizeUserPhraseModeration("phrase-1", "una frase anonima")).rejects.toThrow("network error");
  });
});

describe("setPhraseActive", () => {
  it("deactivates without fetching or spending, when turning off", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await setPhraseActive("phrase-1", false);

    expect(updateMock).toHaveBeenCalledWith({ active: false });
    expect(fetchSelectMock).not.toHaveBeenCalled();
  });

  it("throws when activating a phrase that isn't approved", async () => {
    setUpFetchChain();
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNotApprovedFixture);

    await expect(setPhraseActive("phrase-1", true)).rejects.toThrow(
      "Phrase must be approved before it can be activated."
    );
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });

  it("activates without recomputing when an embedding already exists", async () => {
    setUpFetchChain();
    fetchSingleMock.mockResolvedValueOnce(selectPhraseAlreadyEmbeddedFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await setPhraseActive("phrase-1", true);

    expect(getEmbeddingMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ active: true });
  });

  it("computes and stores an embedding when activating a phrase that doesn't have one yet", async () => {
    setUpFetchChain();
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNeedsEmbeddingFixture);
    canSpendTodayMock.mockResolvedValueOnce(true);
    getEmbeddingMock.mockResolvedValueOnce(embeddingResultFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await setPhraseActive("phrase-1", true);

    expect(recordEmbeddingSpendMock).toHaveBeenCalledWith(embeddingResultFixture.totalTokens);
    expect(updateMock).toHaveBeenCalledWith({ active: true, embedding: embeddingResultFixture.embedding });
  });

  it("throws instead of activating with no embedding when the daily spend cap is reached", async () => {
    setUpFetchChain();
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNeedsEmbeddingFixture);
    canSpendTodayMock.mockResolvedValueOnce(false);

    await expect(setPhraseActive("phrase-1", true)).rejects.toThrow("Daily spend cap reached — try again later.");
    expect(getEmbeddingMock).not.toHaveBeenCalled();
  });

  it("propagates the error when the pre-activation fetch fails", async () => {
    setUpFetchChain();
    fetchSingleMock.mockResolvedValueOnce(selectPhraseErrorFixture);

    await expect(setPhraseActive("phrase-1", true)).rejects.toThrow("select failed");
  });
});

describe("approvePhrase", () => {
  it("sets moderation_status to approved and activates the phrase", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // moderation_status update
    fetchSingleMock.mockResolvedValueOnce(selectPhraseAlreadyEmbeddedFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // active update

    await approvePhrase("phrase-1");

    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "approved" });
    expect(updateMock).toHaveBeenCalledWith({ active: true });
  });

  it("stays approved-but-inactive without throwing when activation fails on the spend cap", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // moderation_status update
    fetchSingleMock.mockResolvedValueOnce(selectPhraseNeedsEmbeddingFixture);
    canSpendTodayMock.mockResolvedValueOnce(false);

    await expect(approvePhrase("phrase-1")).resolves.toBeUndefined();
    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "approved" });
  });

  it("throws when the approval update itself fails", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateErrorFixture);

    await expect(approvePhrase("phrase-1")).rejects.toThrow("update failed");
  });
});

describe("rejectPhrase", () => {
  it("sets moderation_status to rejected and deactivates the phrase", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // moderation_status update
    eqMock.mockResolvedValueOnce(updateSuccessFixture); // active update

    await rejectPhrase("phrase-1");

    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "rejected" });
    expect(updateMock).toHaveBeenCalledWith({ active: false });
  });

  it("throws when the rejection update itself fails", async () => {
    setUpFetchChain();
    eqMock.mockResolvedValueOnce(updateErrorFixture);

    await expect(rejectPhrase("phrase-1")).rejects.toThrow("update failed");
  });
});

describe("findClosestPhrase", () => {
  it("calls the match_phrase RPC with the given embedding", async () => {
    rpcMock.mockResolvedValueOnce(matchPhraseNoneFoundFixture);

    await findClosestPhrase([0.1, 0.2, 0.3]);

    expect(rpcMock).toHaveBeenCalledWith("match_phrase", { query_embedding: [0.1, 0.2, 0.3] });
  });

  it("returns the closest phrase when a match is found", async () => {
    rpcMock.mockResolvedValueOnce(matchPhraseFoundFixture);

    const result = await findClosestPhrase([0.1, 0.2, 0.3]);

    expect(result).toEqual(matchPhraseFoundFixture.data[0]);
  });

  it("returns null when the corpus has no active phrases to match", async () => {
    rpcMock.mockResolvedValueOnce(matchPhraseNoneFoundFixture);

    const result = await findClosestPhrase([0.1, 0.2, 0.3]);

    expect(result).toBeNull();
  });

  it("throws when the RPC call fails", async () => {
    rpcMock.mockResolvedValueOnce(matchPhraseErrorFixture);

    await expect(findClosestPhrase([0.1, 0.2, 0.3])).rejects.toThrow("rpc failed");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import {
  insertPhraseErrorFixture,
  insertPhraseSuccessFixture,
  updateErrorFixture,
  updateSuccessFixture,
} from "@/test/fixtures/supabase-responses";

const { fromMock, insertMock, selectMock, singleMock, updateMock, eqMock, moderateTextMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    singleMock: vi.fn(),
    updateMock: vi.fn(),
    eqMock: vi.fn(),
    moderateTextMock: vi.fn(),
  })
);

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/openai", () => ({
  moderateText: moderateTextMock,
}));

const { submitUserPhrase, finalizeUserPhraseModeration } = await import("@/lib/phrases");

function setUpInsertChain() {
  fromMock.mockReturnValue({ insert: insertMock, update: updateMock });
  insertMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ single: singleMock });
  updateMock.mockReturnValue({ eq: eqMock });
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
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "una frase anonima");

    expect(moderateTextMock).toHaveBeenCalledWith("una frase anonima");
  });

  it("approves and activates the phrase when moderation does not flag it", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "una frase anonima");

    expect(fromMock).toHaveBeenCalledWith("phrases");
    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "approved", active: true });
    expect(eqMock).toHaveBeenCalledWith("id", "phrase-1");
  });

  it("rejects and deactivates the phrase when moderation flags it", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateSuccessFixture);

    await finalizeUserPhraseModeration("phrase-1", "texto preocupante");

    expect(updateMock).toHaveBeenCalledWith({ moderation_status: "rejected", active: false });
  });

  it("throws when the update fails", async () => {
    setUpInsertChain();
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    eqMock.mockResolvedValueOnce(updateErrorFixture);

    await expect(finalizeUserPhraseModeration("phrase-1", "una frase anonima")).rejects.toThrow(
      "update failed"
    );
  });

  it("propagates the error when the moderation call itself fails", async () => {
    setUpInsertChain();
    moderateTextMock.mockRejectedValueOnce(new Error("network error"));

    await expect(finalizeUserPhraseModeration("phrase-1", "una frase anonima")).rejects.toThrow(
      "network error"
    );
  });
});

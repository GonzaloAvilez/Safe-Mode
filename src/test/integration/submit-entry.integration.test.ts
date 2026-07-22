// Runs against a real local Postgres (npm run test:integration). Exercises the full
// submitEntry pipeline for real — real Postgres, real match_phrase, real language
// filtering — mocking only the two OpenAI calls (moderateText, getEmbedding) to avoid
// live API cost. Neither entries.test.ts (mocks findClosestPhrase entirely) nor
// match-phrase.integration.test.ts (calls findClosestPhrase directly, never through
// submitEntry) exercise this end-to-end wiring — see [[test-coverage-boundary-reasoning]].
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture } from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

const { moderateTextMock, getEmbeddingMock } = vi.hoisted(() => ({
  moderateTextMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  moderateText: moderateTextMock,
  getEmbedding: getEmbeddingMock,
}));

import { submitEntry } from "@/lib/entries";
import { supabaseAdmin } from "@/lib/supabase";

let insertedPhraseIds: string[] = [];
let insertedEntryIds: string[] = [];

afterEach(async () => {
  if (insertedPhraseIds.length > 0) {
    await supabaseAdmin.from("phrases").delete().in("id", insertedPhraseIds);
    insertedPhraseIds = [];
  }
  if (insertedEntryIds.length > 0) {
    await supabaseAdmin.from("entries").delete().in("id", insertedEntryIds);
    insertedEntryIds = [];
  }
  vi.clearAllMocks();
});

describe("submitEntry (integration, real match_phrase wiring)", () => {
  it("matches the same-language phrase, not an identical-embedding phrase in another language", async () => {
    const sharedEmbedding = realPhraseFixtures[0].embedding;

    
    // TODO(you): insert two phrases via supabaseAdmin.from("phrases").insert([...]):
    // - the English one: text = realPhraseFixtures[0].text, embedding = sharedEmbedding,
    //   language = "en", source = "seed", active = true, moderation_status = "approved"
    // - a Spanish one: any text, same `embedding: sharedEmbedding`, language = "es",
    //   same other fields
    // .select("id") and save both ids into insertedPhraseIds for cleanup.
    const { data, error } = await supabaseAdmin.from("phrases").insert([
        {
        text: realPhraseFixtures[0].text,
        language: "en",
        embedding: sharedEmbedding,
        source: "seed",
        active: true,
        moderation_status: "approved",
        },
        {
        // same input text phrase as realPhraseFixtures but in spanish lang
        text: "A veces estoy rodeado de gente y aun así me siento completamente solo.",
        language: "es",
        embedding: sharedEmbedding,
        source: "seed",
        active: true,
        moderation_status: "approved",
        },
    ]).select("id");

    if (error) throw error;
    insertedPhraseIds = data.map((row) => row.id)

    // TODO(you): set up the two mocks for this test —
    // moderateTextMock should resolve to benignModerationCheckFixture,
    // getEmbeddingMock should resolve to { embedding: sharedEmbedding, totalTokens: 8 }

    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
    getEmbeddingMock.mockResolvedValue({ embedding: sharedEmbedding, totalTokens: 8})
    
    // TODO(you): call submitEntry("some english text", randomUUID()), save the
    // returned entryId into insertedEntryIds, and assert the outcome:
    // - outcome.type should be "matched"
    // - outcome.phrase.text should be realPhraseFixtures[0].text (the English one)

    const outcome   = await submitEntry("Sometimes I burned out with AI", randomUUID());
    insertedEntryIds.push(outcome.entryId);
    expect(outcome.type).toBe("matched");

    if (outcome.type !== "matched") {
      throw new Error(`expected "matched", got "${outcome.type}"`);
    }
    expect(outcome.phrase.text).toBe(realPhraseFixtures[0].text);

  });
});

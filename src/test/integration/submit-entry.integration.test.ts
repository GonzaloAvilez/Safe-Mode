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

    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
    getEmbeddingMock.mockResolvedValue({ embedding: sharedEmbedding, totalTokens: 8})

    const englishOutcome = await submitEntry("Sometimes I burned out with AI", randomUUID());
    const spanishOutcome = await submitEntry("A veces me siento agotado", randomUUID(), undefined, "es");
    insertedEntryIds.push(englishOutcome.entryId, spanishOutcome.entryId);
    expect(englishOutcome.type).toBe("matched");
    expect(spanishOutcome.type).toBe("matched");

    if (englishOutcome.type !== "matched" || spanishOutcome.type !== "matched") {
      throw new Error("expected both locale-partitioned entries to match");
    }
    expect(englishOutcome.phrase.text).toBe(realPhraseFixtures[0].text);
    expect(spanishOutcome.phrase.text).toBe("A veces estoy rodeado de gente y aun así me siento completamente solo.");
  });
});

// Runs against a real local Postgres (npm run test:integration). Exercises the full
// submitEntry pipeline for real — real Postgres, real match_phrase, real language
// filtering — mocking only the two OpenAI calls (moderateText, getEmbedding) to avoid
// live API cost. Neither entries.test.ts (mocks findClosestPhrase entirely) nor
// match-phrase.integration.test.ts (calls findClosestPhrase directly, never through
// submitEntry) exercise this end-to-end wiring — see [[test-coverage-boundary-reasoning]].
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { benignModerationCheckFixture, concerningModerationCheckFixture, generalFlaggedModerationCheckFixture, selfHarmOnlyModerationCheckFixture } from "@/test/fixtures/moderation-check";
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

// These cases verify our routing/storage against controlled provider responses.
// They do not measure the live model's understanding of Spanish or English.
describe.each(["es", "en"] as const)("moderation persistence in %s", (language) => {
  it.each([
    { outcome: "crisis", moderation: concerningModerationCheckFixture },
    { outcome: "crisis", moderation: selfHarmOnlyModerationCheckFixture },
  ])("stores $outcome safely without an embedding", async ({ outcome, moderation }) => {
    const text = language === "es" ? "Entrada sintética para verificar moderación" : "Synthetic entry for moderation verification";
    moderateTextMock.mockResolvedValueOnce(moderation);
    const result = await submitEntry(text, randomUUID(), undefined, language);
    insertedEntryIds.push(result.entryId);
    expect(result.type).toBe(outcome);
    expect(moderateTextMock).toHaveBeenCalledWith(text);
    expect(getEmbeddingMock).not.toHaveBeenCalled();
    const { data: entry, error } = await supabaseAdmin.from("entries")
      .select("text, embedding, flagged_crisis, flagged_general, outcome").eq("id", result.entryId).single();
    if (error) throw error;
    expect(entry).toMatchObject({ text: null, embedding: null, flagged_crisis: true, outcome });
    const { data: isolated, error: isolatedError } = await supabaseAdmin.from("crisis_entries")
      .select("text").eq("entry_id", result.entryId);
    if (isolatedError) throw isolatedError;
    expect(isolated).toEqual([{ text }]);
    const { data: responses, error: responseError } = await supabaseAdmin.from("responses")
      .select("id").eq("entry_id", result.entryId);
    if (responseError) throw responseError;
    expect(responses).toEqual([]);
  });
});

// #261: entries are never shown to anyone, so a general moderation flag is recorded for
// /admin/flagged but never stops the entry. It reaches Mirror like any other.
describe.each(["es", "en"] as const)("a general moderation flag in %s", (language) => {
  it("doesn't stop the entry: it's embedded, matched and answered, and keeps its flag", async () => {
    const phraseText = language === "es" ? "Todavía pongo su plato aunque ya no está." : "I still set out her bowl even though she's gone.";
    const { data: phrases, error: phraseError } = await supabaseAdmin.from("phrases").insert({
      text: phraseText,
      language,
      embedding: realPhraseFixtures[0].embedding,
      source: "seed",
      active: true,
      moderation_status: "approved",
    }).select("id");
    if (phraseError) throw phraseError;
    insertedPhraseIds = phrases.map((row) => row.id);

    moderateTextMock.mockResolvedValueOnce(generalFlaggedModerationCheckFixture);
    getEmbeddingMock.mockResolvedValueOnce({ embedding: realPhraseFixtures[0].embedding, totalTokens: 8 });
    const text = language === "es" ? "Se murió mi gata y la encontré en el jardín." : "My cat died and I found her in the yard.";
    const sessionId = randomUUID();

    const result = await submitEntry(text, sessionId, undefined, language);
    insertedEntryIds.push(result.entryId);

    expect(result.type).toBe("matched");
    if (result.type !== "matched") throw new Error("expected the flagged entry to match");
    expect(result.phrase.text).toBe(phraseText);
    const { data: entry, error } = await supabaseAdmin.from("entries")
      .select("text, embedding, flagged_crisis, flagged_general, outcome, matched_phrase_id").eq("id", result.entryId).single();
    if (error) throw error;
    expect(entry).toMatchObject({ text, flagged_crisis: false, flagged_general: true, outcome: "matched", matched_phrase_id: insertedPhraseIds[0] });
    expect(entry.embedding).not.toBeNull();
    const { data: responses, error: responseError } = await supabaseAdmin.from("responses")
      .select("session_id").eq("entry_id", result.entryId);
    if (responseError) throw responseError;
    expect(responses).toEqual([{ session_id: sessionId }]);
  });
});

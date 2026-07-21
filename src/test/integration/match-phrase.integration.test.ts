// Runs against a real local Postgres + PostgREST (npm run test:integration). Exercises
// the actual match_phrase RPC and its similarity-threshold SQL, using real embeddings
// frozen from the live corpus (src/test/fixtures/real-phrase-embeddings.ts) — random
// vectors don't have realistic cosine similarity geometry, so they wouldn't meaningfully
// test the > 0.5 threshold filter.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findClosestPhrase } from "@/lib/phrases";
import { supabaseAdmin } from "@/lib/supabase";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

let insertedIds: string[] = [];

beforeAll(async () => {
  const rows = realPhraseFixtures.map((f) => ({
    text: f.text,
    embedding: f.embedding,
    source: "seed",
    active: true,
    moderation_status: "approved",
  }));

  const { data, error } = await supabaseAdmin.from("phrases").insert(rows).select("id");
  if (error) throw error;
  insertedIds = data.map((row) => row.id);
});

afterAll(async () => {
  if (insertedIds.length > 0) {
    await supabaseAdmin.from("phrases").delete().in("id", insertedIds);
  }
});

describe("findClosestPhrase / match_phrase (integration)", () => {
  it("finds the closest phrase for an embedding identical to one already in the corpus", async () => {
    const target = realPhraseFixtures[0];

    const match = await findClosestPhrase(target.embedding, "en");

    expect(match).not.toBeNull();
    expect(match?.text).toBe(target.text);
    // An identical vector compared to itself has cosine similarity ~1.0 (allowing for
    // floating point round-tripping through JSON/pgvector).
    expect(match?.similarity).toBeGreaterThan(0.99);
  });

  it("returns null when no phrase in the corpus is active", async () => {
    await supabaseAdmin.from("phrases").update({ active: false }).in("id", insertedIds);

    try {
      const match = await findClosestPhrase(realPhraseFixtures[0].embedding, "en");
      expect(match).toBeNull();
    } finally {
      await supabaseAdmin.from("phrases").update({ active: true }).in("id", insertedIds);
    }
  });
});

// Runs against a real local Postgres (npm run test:integration). The check constraint on
// phrases.origin (origin in ('leave_a_trace', 'contribute')) lives in the database itself,
// not in TypeScript — no mocked test could ever prove Postgres actually rejects an invalid
// value. Deliberately narrow: one valid insert round-trips, one invalid insert is rejected.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

let insertedIds: string[] = [];

afterEach(async () => {
  if (insertedIds.length > 0) {
    await supabaseAdmin.from("phrases").delete().in("id", insertedIds);
    insertedIds = [];
  }
});

describe("phrases.origin check constraint (integration)", () => {
  it("accepts a valid origin value", async () => {
    const { data: response, error: responseError } = await supabaseAdmin.from("phrases").insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: "user",
      active: false,
      origin: LEAVE_A_TRACE_ORIGIN,
      moderation_status: "approved",
    }).select("id, origin").single();

    if (responseError) throw responseError;
    insertedIds.push(response.id);
    expect(response.origin).toBe(LEAVE_A_TRACE_ORIGIN);
  });

  it("rejects an invalid origin value", async () => {
    const { data: response, error: responseError } = await supabaseAdmin.from("phrases").insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: "user",
      active: false,
      origin: "fake_origin",
      moderation_status: "approved",
    });
    expect(responseError).not.toBeNull();
  });
});

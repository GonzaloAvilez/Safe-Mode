// Runs against a real local Postgres (npm run test:integration). Exercises the actual
// entries/responses/crisis_entries schema — the FK relationship, the responses scale
// check constraint, and the on-delete-cascade — none of which entries.test.ts can catch
// since it fully mocks @/lib/responses and @/lib/crisis-entries.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { createResponse } from "@/lib/responses";
import { insertCrisisContent } from "@/lib/crisis-entries";

let insertedEntryIds: string[] = [];

afterEach(async () => {
  if (insertedEntryIds.length > 0) {
    await supabaseAdmin.from("entries").delete().in("id", insertedEntryIds);
    insertedEntryIds = [];
  }
});

async function insertTestEntry(
  overrides: Partial<{ text: string | null; flaggedCrisis: boolean; flaggedGeneral: boolean }> = {}
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("entries")
    .insert({
      text: "text" in overrides ? overrides.text : "un dia normal",
      flagged_crisis: overrides.flaggedCrisis ?? false,
      flagged_general: overrides.flaggedGeneral ?? false,
      embedding: null,
    })
    .select("id")
    .single();

  if (error) throw error;

  insertedEntryIds.push(data.id);
  return data.id;
}

describe("entries / responses (integration)", () => {
  it("keeps a general entry's text on entries and links a response to it via entry_id", async () => {
    const entryId = await insertTestEntry({ text: "un dia normal" });
    await createResponse(entryId, randomUUID(), 3);

    const { data: entry, error: entryError } = await supabaseAdmin
      .from("entries")
      .select("text")
      .eq("id", entryId)
      .single();
    if (entryError) throw entryError;
    expect(entry.text).toBe("un dia normal");

    const { data: response, error: responseError } = await supabaseAdmin
      .from("responses")
      .select("scale_before")
      .eq("entry_id", entryId)
      .single();
    if (responseError) throw responseError;
    expect(response.scale_before).toBe(3);
  });

  it("rejects a response with scale_before outside 1-5 via the real check constraint", async () => {
    const entryId = await insertTestEntry();

    await expect(createResponse(entryId, randomUUID(), 6)).rejects.toThrow();
  });

  it("cascades: deleting an entry deletes its response", async () => {
    const entryId = await insertTestEntry();
    await createResponse(entryId, randomUUID(), 2);

    const { error } = await supabaseAdmin.from("entries").delete().eq("id", entryId);
    if (error) throw error;
    insertedEntryIds = insertedEntryIds.filter((id) => id !== entryId);

    const { data: responses, error: responsesError } = await supabaseAdmin
      .from("responses")
      .select("id")
      .eq("entry_id", entryId);
    if (responsesError) throw responsesError;
    expect(responses).toEqual([]);
  });
});

describe("crisis_entries (integration)", () => {
  it("stores crisis text only in crisis_entries, never in entries.text", async () => {
    const entryId = await insertTestEntry({ text: null, flaggedCrisis: true });
    await insertCrisisContent(entryId, "texto de crisis");

    const { data: entry, error: entryError } = await supabaseAdmin
      .from("entries")
      .select("text")
      .eq("id", entryId)
      .single();
    if (entryError) throw entryError;
    expect(entry.text).toBeNull();

    const { data: crisis, error: crisisError } = await supabaseAdmin
      .from("crisis_entries")
      .select("text")
      .eq("entry_id", entryId)
      .single();
    if (crisisError) throw crisisError;
    expect(crisis.text).toBe("texto de crisis");
  });

  it("cascades: deleting an entry deletes its crisis_entries row", async () => {
    const entryId = await insertTestEntry({ text: null, flaggedCrisis: true });
    await insertCrisisContent(entryId, "texto de crisis");

    const { error } = await supabaseAdmin.from("entries").delete().eq("id", entryId);
    if (error) throw error;
    insertedEntryIds = insertedEntryIds.filter((id) => id !== entryId);

    const { data: crisis, error: crisisError } = await supabaseAdmin
      .from("crisis_entries")
      .select("entry_id")
      .eq("entry_id", entryId);
    if (crisisError) throw crisisError;
    expect(crisis).toEqual([]);
  });
});

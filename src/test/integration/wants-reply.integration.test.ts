// Runs against a real local Postgres (npm run test:integration). Proves the ownership
// check on Mirror's "I would love to connect" toggle against real rows: only the session
// that wrote the entry can change its wants_reply.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createResponse, setWantsReply } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

let entryIds: string[] = [];

afterEach(async () => {
  if (entryIds.length > 0) await supabaseAdmin.from("entries").delete().in("id", entryIds);
  entryIds = [];
});

async function createEntryForSession(sessionId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("entries")
    .insert({ text: "un dia normal", flagged_crisis: false, flagged_general: false, embedding: null })
    .select("id")
    .single();
  if (error) throw error;
  entryIds.push(data.id);
  await createResponse(data.id, sessionId);
  return data.id;
}

async function wantsReply(entryId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("responses").select("wants_reply").eq("entry_id", entryId).single();
  if (error) throw error;
  return data.wants_reply;
}

describe("setWantsReply (integration)", () => {
  it("lets the session that wrote the entry toggle it", async () => {
    const owner = randomUUID();
    const entryId = await createEntryForSession(owner);

    expect(await setWantsReply(entryId, owner, true)).toBe(true);
    expect(await wantsReply(entryId)).toBe(true);
  });

  it("changes nothing for another session", async () => {
    const entryId = await createEntryForSession(randomUUID());

    expect(await setWantsReply(entryId, randomUUID(), true)).toBe(false);
    expect(await wantsReply(entryId)).toBe(false);
  });

  it("returns false for an id that doesn't exist", async () => {
    expect(await setWantsReply(randomUUID(), randomUUID(), true)).toBe(false);
  });
});

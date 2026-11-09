// Runs against a real local Postgres (npm run test:integration). The guarantees of the
// ADR-004 letter tables (one correspondence per visitor per phrase, allowed sender/status values,
// cascades) live in the database itself, so only a real database can prove them.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";

let identityIds: string[] = [];
let phraseIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  identityIds = [];
});

async function createIdentity(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("identities").insert({}).select("id").single();
  if (error) throw error;
  identityIds.push(data.id);
  return data.id;
}

async function createPhrase(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: "user",
      active: false,
      origin: LEAVE_A_TRACE_ORIGIN,
      moderation_status: "approved",
    })
    .select("id")
    .single();
  if (error) throw error;
  phraseIds.push(data.id);
  return data.id;
}

async function createCorrespondence(phraseId: string, visitorIdentityId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .insert({ phrase_id: phraseId, visitor_identity_id: visitorIdentityId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("correspondences (integration)", () => {
  it("rejects a second correspondence from the same visitor to the same phrase", async () => {
    const phraseId = await createPhrase();
    const visitorId = await createIdentity();
    await createCorrespondence(phraseId, visitorId);

    const { error } = await supabaseAdmin
      .from("correspondences")
      .insert({ phrase_id: phraseId, visitor_identity_id: visitorId });
    expect(error).not.toBeNull();
  });

  it("deleting the phrase removes its correspondences and their letters", async () => {
    const phraseId = await createPhrase();
    const correspondenceId = await createCorrespondence(phraseId, await createIdentity());
    await supabaseAdmin.from("letters").insert({ correspondence_id: correspondenceId, sender: "visitor", body: "hola" });

    await supabaseAdmin.from("phrases").delete().eq("id", phraseId);

    const { data: correspondences } = await supabaseAdmin.from("correspondences").select("id").eq("id", correspondenceId);
    const { data: letters } = await supabaseAdmin.from("letters").select("id").eq("correspondence_id", correspondenceId);
    expect(correspondences).toEqual([]);
    expect(letters).toEqual([]);
  });

  it("deleting the visitor's identity removes their correspondences", async () => {
    const visitorId = await createIdentity();
    const correspondenceId = await createCorrespondence(await createPhrase(), visitorId);

    await supabaseAdmin.from("identities").delete().eq("id", visitorId);

    const { data: correspondences } = await supabaseAdmin.from("correspondences").select("id").eq("id", correspondenceId);
    expect(correspondences).toEqual([]);
  });
});

describe("letters (integration)", () => {
  it("defaults a new letter to draft", async () => {
    const correspondenceId = await createCorrespondence(await createPhrase(), await createIdentity());

    const { data, error } = await supabaseAdmin
      .from("letters")
      .insert({ correspondence_id: correspondenceId, sender: "visitor", body: "hola" })
      .select("status")
      .single();
    if (error) throw error;
    expect(data.status).toBe("draft");
  });

  it("rejects an unknown sender", async () => {
    const correspondenceId = await createCorrespondence(await createPhrase(), await createIdentity());

    const { error } = await supabaseAdmin
      .from("letters")
      .insert({ correspondence_id: correspondenceId, sender: "founder", body: "hola" });
    expect(error).not.toBeNull();
  });

  it("rejects an unknown status", async () => {
    const correspondenceId = await createCorrespondence(await createPhrase(), await createIdentity());

    const { error } = await supabaseAdmin
      .from("letters")
      .insert({ correspondence_id: correspondenceId, sender: "visitor", body: "hola", status: "answered" });
    expect(error).not.toBeNull();
  });
});

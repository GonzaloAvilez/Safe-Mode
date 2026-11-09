// Runs against a real local Postgres (npm run test:integration). The guarantees of the
// ADR-004 letter tables (one request per visitor per phrase, allowed sender/status values,
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

async function createRequest(phraseId: string, requesterIdentityId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("connection_requests")
    .insert({ phrase_id: phraseId, requester_identity_id: requesterIdentityId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("connection_requests (integration)", () => {
  it("rejects a second request from the same visitor to the same phrase", async () => {
    const phraseId = await createPhrase();
    const visitorId = await createIdentity();
    await createRequest(phraseId, visitorId);

    const { error } = await supabaseAdmin
      .from("connection_requests")
      .insert({ phrase_id: phraseId, requester_identity_id: visitorId });
    expect(error).not.toBeNull();
  });

  it("deleting the phrase removes its requests and their messages", async () => {
    const phraseId = await createPhrase();
    const requestId = await createRequest(phraseId, await createIdentity());
    await supabaseAdmin.from("connection_messages").insert({ request_id: requestId, sender: "visitor", body: "hola" });

    await supabaseAdmin.from("phrases").delete().eq("id", phraseId);

    const { data: requests } = await supabaseAdmin.from("connection_requests").select("id").eq("id", requestId);
    const { data: messages } = await supabaseAdmin.from("connection_messages").select("id").eq("request_id", requestId);
    expect(requests).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("deleting the visitor's identity removes their requests", async () => {
    const visitorId = await createIdentity();
    const requestId = await createRequest(await createPhrase(), visitorId);

    await supabaseAdmin.from("identities").delete().eq("id", visitorId);

    const { data: requests } = await supabaseAdmin.from("connection_requests").select("id").eq("id", requestId);
    expect(requests).toEqual([]);
  });
});

describe("connection_messages (integration)", () => {
  it("defaults a new message to draft", async () => {
    const requestId = await createRequest(await createPhrase(), await createIdentity());

    const { data, error } = await supabaseAdmin
      .from("connection_messages")
      .insert({ request_id: requestId, sender: "visitor", body: "hola" })
      .select("status")
      .single();
    if (error) throw error;
    expect(data.status).toBe("draft");
  });

  it("rejects an unknown sender", async () => {
    const requestId = await createRequest(await createPhrase(), await createIdentity());

    const { error } = await supabaseAdmin
      .from("connection_messages")
      .insert({ request_id: requestId, sender: "founder", body: "hola" });
    expect(error).not.toBeNull();
  });

  it("rejects an unknown status", async () => {
    const requestId = await createRequest(await createPhrase(), await createIdentity());

    const { error } = await supabaseAdmin
      .from("connection_messages")
      .insert({ request_id: requestId, sender: "visitor", body: "hola", status: "answered" });
    expect(error).not.toBeNull();
  });
});

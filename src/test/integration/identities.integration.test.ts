// Runs against a real local Postgres (npm run test:integration). The guarantees of the
// ADR-004 identity schema (unique key hashes, allowed credential kinds, cascade/set-null
// behavior) live in the database itself, so only a real database can prove them.
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

function uniqueHash(): string {
  return crypto.randomUUID().replace(/-/g, "").padEnd(64, "0");
}

describe("identities schema (integration)", () => {
  it("rejects a duplicate key_hash", async () => {
    const identityId = await createIdentity();
    const keyHash = uniqueHash();

    const first = await supabaseAdmin.from("identity_keys").insert({ identity_id: identityId, kind: "return_key", key_hash: keyHash });
    expect(first.error).toBeNull();

    const second = await supabaseAdmin.from("identity_keys").insert({ identity_id: identityId, kind: "return_key", key_hash: keyHash });
    expect(second.error).not.toBeNull();
  });

  it("rejects an unknown credential kind", async () => {
    const identityId = await createIdentity();
    const { error } = await supabaseAdmin.from("identity_keys").insert({ identity_id: identityId, kind: "email", key_hash: uniqueHash() });
    expect(error).not.toBeNull();
  });

  it("deleting an identity removes its keys and leaves its phrases ownerless", async () => {
    const identityId = await createIdentity();
    const keyHash = uniqueHash();
    await supabaseAdmin.from("identity_keys").insert({ identity_id: identityId, kind: "return_key", key_hash: keyHash });

    const { data: phrase, error: phraseError } = await supabaseAdmin
      .from("phrases")
      .insert({
        text: realPhraseFixtures[1].text,
        embedding: realPhraseFixtures[1].embedding,
        source: "user",
        active: false,
        origin: LEAVE_A_TRACE_ORIGIN,
        moderation_status: "approved",
        identity_id: identityId,
      })
      .select("id")
      .single();
    if (phraseError) throw phraseError;
    phraseIds.push(phrase.id);

    await supabaseAdmin.from("identities").delete().eq("id", identityId);

    const { data: keys } = await supabaseAdmin.from("identity_keys").select("id").eq("key_hash", keyHash);
    expect(keys).toEqual([]);

    const { data: orphan } = await supabaseAdmin.from("phrases").select("identity_id").eq("id", phrase.id).single();
    expect(orphan?.identity_id).toBeNull();
  });
});

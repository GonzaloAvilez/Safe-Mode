// Runs against a real local Postgres (npm run test:integration). Exercises
// deleteAbandonedIdentities end to end: which identities go and which stay, through the real
// tables, cascades and PostgREST filters. Identities and seals are written directly, with the age
// each case needs.
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";
import { ABANDONED_IDENTITY_BATCH_SIZE, deleteAbandonedIdentities } from "@/lib/abandoned-identities";
import { supabaseAdmin } from "@/lib/supabase";

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS).toISOString();

let identityIds: string[] = [];
let phraseIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  identityIds = [];
  phraseIds = [];
});

type SealAge = { sealHoursAgo: number; confirmed?: boolean };

async function createIdentity({ sealHoursAgo, confirmed = false }: SealAge): Promise<string> {
  const { data: identity, error } = await supabaseAdmin.from("identities").insert({}).select("id").single();
  if (error) throw error;
  identityIds.push(identity.id);
  const created = hoursAgo(sealHoursAgo);
  const { error: keyError } = await supabaseAdmin.from("identity_keys").insert({
    identity_id: identity.id,
    kind: "return_key",
    key_hash: randomBytes(32).toString("hex"),
    created_at: created,
    confirmed_at: confirmed ? created : null,
  });
  if (keyError) throw keyError;
  return identity.id;
}

async function createPhrase(identityId: string | null, source: "seed" | "user" = "user"): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source,
      origin: source === "seed" ? null : LEAVE_A_TRACE_ORIGIN,
      active: true,
      moderation_status: "approved",
      identity_id: identityId,
    })
    .select("id")
    .single();
  if (error) throw error;
  phraseIds.push(data.id);
  return data.id;
}

async function identityExists(identityId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("identities").select("id").eq("id", identityId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function keyCount(identityId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("identity_keys")
    .select("id", { count: "exact", head: true })
    .eq("identity_id", identityId);
  if (error) throw error;
  return count ?? 0;
}

// Runs the cleanup until it finds nothing more, so a leftover in the local database never decides
// which of this test's identities a single run reaches.
async function deleteUntilNoneLeft(): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await deleteAbandonedIdentities();
    total += deleted;
    if (deleted === 0) return total;
  }
}

describe("deleteAbandonedIdentities (integration)", () => {
  it("deletes an unconfirmed seal older than a day, on an identity that holds nothing, with its seal", async () => {
    const abandoned = await createIdentity({ sealHoursAgo: 25 });

    expect(await deleteUntilNoneLeft()).toBeGreaterThanOrEqual(1);

    expect(await identityExists(abandoned)).toBe(false);
    expect(await keyCount(abandoned)).toBe(0);
  });

  it("keeps a seal asked for less than a day ago: its visitor may still be keeping it", async () => {
    const recent = await createIdentity({ sealHoursAgo: 23 });

    await deleteUntilNoneLeft();

    expect(await identityExists(recent)).toBe(true);
    expect(await keyCount(recent)).toBe(1);
  });

  it("keeps a confirmed seal, even one that never wrote", async () => {
    const confirmed = await createIdentity({ sealHoursAgo: 72, confirmed: true });

    await deleteUntilNoneLeft();

    expect(await identityExists(confirmed)).toBe(true);
  });

  it("keeps an author who never confirmed: their identity holds their phrase", async () => {
    const author = await createIdentity({ sealHoursAgo: 72 });
    const phraseId = await createPhrase(author);

    await deleteUntilNoneLeft();

    expect(await identityExists(author)).toBe(true);
    const { data } = await supabaseAdmin.from("phrases").select("identity_id").eq("id", phraseId).single();
    expect(data?.identity_id).toBe(author);
  });

  it("keeps an identity that started a correspondence, and the correspondence", async () => {
    const visitor = await createIdentity({ sealHoursAgo: 72 });
    const phraseId = await createPhrase(null, "seed");
    const { data: correspondence, error } = await supabaseAdmin
      .from("correspondences")
      .insert({ phrase_id: phraseId, visitor_identity_id: visitor })
      .select("id")
      .single();
    if (error) throw error;

    await deleteUntilNoneLeft();

    expect(await identityExists(visitor)).toBe(true);
    const { count } = await supabaseAdmin
      .from("correspondences")
      .select("id", { count: "exact", head: true })
      .eq("id", correspondence.id);
    expect(count).toBe(1);
  });

  it("removes more than one run's worth over several runs, a batch at a time", async () => {
    const abandoned = await Promise.all(
      Array.from({ length: ABANDONED_IDENTITY_BATCH_SIZE + 3 }, () => createIdentity({ sealHoursAgo: 30 }))
    );

    expect(await deleteAbandonedIdentities()).toBeLessThanOrEqual(ABANDONED_IDENTITY_BATCH_SIZE);
    await deleteUntilNoneLeft();

    const remaining = await Promise.all(abandoned.map(identityExists));
    expect(remaining.filter(Boolean)).toHaveLength(0);
  });

  // #258 review: identities that must stay can never fill every run's window.
  it("reaches an abandoned seal behind a full batch of older ones whose identities stay, in one run", async () => {
    await deleteUntilNoneLeft();
    const authors = await Promise.all(
      Array.from({ length: ABANDONED_IDENTITY_BATCH_SIZE + 2 }, async () => {
        const author = await createIdentity({ sealHoursAgo: 100 });
        await createPhrase(author);
        return author;
      })
    );
    const abandoned = await createIdentity({ sealHoursAgo: 30 });

    expect(await deleteAbandonedIdentities()).toBe(1);

    expect(await identityExists(abandoned)).toBe(false);
    expect((await Promise.all(authors.map(identityExists))).every(Boolean)).toBe(true);
  });

  it("does nothing, and never fails, when there's nothing to delete", async () => {
    await deleteUntilNoneLeft();
    const unrelated = randomUUID();

    expect(await deleteAbandonedIdentities()).toBe(0);
    expect(await identityExists(unrelated)).toBe(false);
  });
});

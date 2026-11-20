import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";

// ADR-004 #212: with the seal first (design B), a visitor gets a seal before writing. Whoever asks
// for one and leaves without confirming it leaves an identity behind: no PII and no content, but it
// adds up. This removes those, and only those: a seal never confirmed, older than a day, whose
// identity holds no phrase and no correspondence. Nobody can ever use it: an unconfirmed seal can't
// write a letter or receive one.
//
// Kept on purpose: an author who left a trace with letters but never confirmed (their identity
// holds the phrase), and a visitor who confirmed but didn't write (a confirmed seal is theirs).

export const ABANDONED_IDENTITY_HOURS = 24;

// How many identities one run deletes at most, and how many seals it reads per page. Ids travel in
// the URL of the next requests (`.in(...)`): a cap keeps that URL short, so a day with many
// abandoned seals (a bot asking for them) can't break every run after it; whatever's left waits for
// the next run.
export const ABANDONED_IDENTITY_BATCH_SIZE = 50;

const HOUR_MS = 60 * 60 * 1000;

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

// Of these identities, the ones that hold something: a phrase, a correspondence they started, or a
// confirmed seal. Those always stay.
async function findIdentitiesToKeep(identityIds: string[]): Promise<Set<string>> {
  const [phrases, correspondences, confirmedKeys] = await Promise.all([
    supabaseAdmin.from("phrases").select("identity_id").in("identity_id", identityIds),
    supabaseAdmin.from("correspondences").select("visitor_identity_id").in("visitor_identity_id", identityIds),
    supabaseAdmin
      .from("identity_keys")
      .select("identity_id")
      .in("identity_id", identityIds)
      .not("confirmed_at", "is", null),
  ]);

  return new Set([
    ...unwrap(phrases.data, phrases.error).map((row) => row.identity_id as string),
    ...unwrap(correspondences.data, correspondences.error).map((row) => row.visitor_identity_id as string),
    ...unwrap(confirmedKeys.data, confirmedKeys.error).map((row) => row.identity_id as string),
  ]);
}

// Up to a batch of identities to delete: those of unconfirmed seals older than `cutoff` that hold
// nothing. Reads the old unconfirmed seals a page at a time, oldest first, past the ones that stay,
// so identities that must stay (an author who never confirmed holds their phrase forever) can never
// fill every run's window and starve the abandoned ones after them (#258 review).
//
// Offsets are enough: nothing is deleted while reading, and a seal confirmed meanwhile only shifts
// the pages, so at worst a candidate waits for the next run.
async function findAbandonedIdentities(cutoff: string): Promise<string[]> {
  const candidates = new Set<string>();

  for (let offset = 0; candidates.size < ABANDONED_IDENTITY_BATCH_SIZE; offset += ABANDONED_IDENTITY_BATCH_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("identity_keys")
      .select("identity_id")
      .eq("kind", "return_key")
      .is("confirmed_at", null)
      .lt("created_at", cutoff)
      .order("created_at")
      .order("id")
      .range(offset, offset + ABANDONED_IDENTITY_BATCH_SIZE - 1);
    const page = unwrap(data, error).map((row) => row.identity_id as string);
    if (page.length === 0) break;

    const found = unique(page);
    const keep = await findIdentitiesToKeep(found);
    for (const identityId of found) {
      if (!keep.has(identityId) && candidates.size < ABANDONED_IDENTITY_BATCH_SIZE) candidates.add(identityId);
    }

    // A page shorter than a full one was the last.
    if (page.length < ABANDONED_IDENTITY_BATCH_SIZE) break;
  }

  return [...candidates];
}

// Returns how many identities were removed: a count, never which ones (ADR-004 layer 8).
//
// Three steps, because PostgREST can't delete with a subquery. Each one checks again what matters,
// so a seal confirmed meanwhile is never touched:
//   1. the candidates: an unconfirmed seal older than a day, on an identity that holds nothing;
//   2. their seals are deleted, still only while unconfirmed: one confirmed between the steps stays;
//   3. only the identities whose seal was really deleted go. Without a seal nobody can act as them,
//      and without a confirmed one they can't have gained a phrase or a correspondence meanwhile.
export async function deleteAbandonedIdentities(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_IDENTITY_HOURS * HOUR_MS).toISOString();

  const candidates = await findAbandonedIdentities(cutoff);
  if (candidates.length === 0) return 0;

  const { data: deletedKeys, error: keysError } = await supabaseAdmin
    .from("identity_keys")
    .delete()
    .in("identity_id", candidates)
    .eq("kind", "return_key")
    .is("confirmed_at", null)
    .select("identity_id");
  const sealless = unique(unwrap(deletedKeys, keysError).map((row) => row.identity_id as string));
  if (sealless.length === 0) return 0;

  const { data: deletedIdentities, error: identitiesError } = await supabaseAdmin
    .from("identities")
    .delete()
    .in("id", sealless)
    .select("id");
  return unwrap(deletedIdentities, identitiesError).length;
}

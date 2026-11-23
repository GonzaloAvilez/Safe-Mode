import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";
import { parseSeal } from "@/lib/parse-seal";

// ADR-004 layer 3 (#209): anonymous identities and their return keys. Used by both sides
// of a letter: the phrase author and the visitor who writes to them.
//
// A return key is a capability secret: whoever holds it is that identity. Only its hash is
// stored, so a lost key can't be recovered by anyone, the founder included. That's the
// anonymity promise, not a bug.
//
// The key is a 15-digit number, shown to the person as a seal ("48213 39017 56229";
// decided 2026-11-16 on #212). Random digits mean nothing, so the key says nothing about
// whoever holds it. The sentence that comes with it on the card (#212) is a gift, not part
// of the key.

const SEAL_DIGITS = 15;

// The format before the seal (#209): 32 random bytes as base64url, always 43 characters.
// Still accepted so any key already handed out keeps working; never generated anymore.
const LEGACY_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const MIN_HASH_SECRET_LENGTH = 32;

export function generateReturnKey(): string {
  return Array.from({ length: SEAL_DIGITS }, () => randomInt(10)).join("");
}

// The one form a key is hashed in, however the person typed it: a seal keeps only its
// digits, a legacy key stays as is (it's case-sensitive). null when it's neither.
//
// A seal is read by parseSeal, the same function the mailbox uses in the browser, so what the
// screen accepts and what the server accepts can't drift apart.
export function normalizeReturnKey(input: string): string | null {
  const trimmed = input.trim();
  if (LEGACY_KEY_PATTERN.test(trimmed)) return trimmed;

  return parseSeal(trimmed);
}

export function isWellFormedReturnKey(key: string): boolean {
  return normalizeReturnKey(key) !== null;
}

// 10^15 seals is about 50 bits: too few for a plain hash, because whoever stole the table
// could hash every possible seal until one matched. So a seal is hashed with HMAC-SHA256 and
// a server secret (a "pepper") that lives in Vercel, never in the database: the table alone
// is useless for guessing. What's left is guessing through the API, and every route that
// checks a key (mailbox, letters, confirm) rate-limits that.
//
// The secret can never change. Only hashes are stored, so existing keys can't be re-hashed:
// changing or losing it locks every holder out for good. Without it this throws; it never
// falls back to a plain hash.
function hashSecret(): string {
  const secret = process.env.RETURN_KEY_HASH_SECRET;
  if (!secret || secret.length < MIN_HASH_SECRET_LENGTH) {
    throw new Error(`RETURN_KEY_HASH_SECRET must be set, at least ${MIN_HASH_SECRET_LENGTH} characters`);
  }
  return secret;
}

// Deterministic, so verification stays one indexed lookup. A legacy key keeps its plain
// SHA-256: its 256 bits can't be guessed back from the hash, and that's how those rows were
// stored.
export function hashReturnKey(key: string): string {
  const normalized = normalizeReturnKey(key);
  if (normalized === null) throw new Error("not a return key");

  if (LEGACY_KEY_PATTERN.test(normalized)) {
    return createHash("sha256").update(normalized).digest("hex");
  }
  return createHmac("sha256", hashSecret()).update(normalized).digest("hex");
}

// Undoes a half-finished key handoff: deletes the identity, cascading to its keys and to
// the correspondences and letters it started; a phrase it wrote stays, without an author
// (phrases.identity_id is set null). A failure here is logged, not thrown: the caller is
// already failing with the error that matters, and what's left is an unreachable identity
// with no PII.
export async function deleteIdentity(identityId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("identities").delete().eq("id", identityId);
  if (error) console.error("couldn't clean up an identity after a failure", error);
}

// Creates a new anonymous identity with one return key. The raw key is returned exactly
// once, for the caller to show the person; it's never stored or logged.
//
// Two inserts, not one transaction (that would need an RPC, i.e. a migration). If the key
// insert fails, the identity is deleted. If that cleanup also fails, what's left is an
// empty identity with no key, no content and no PII: unreachable and harmless.
export async function createIdentityWithReturnKey(): Promise<{ identityId: string; returnKey: string }> {
  // Hashed before anything is written, so a missing secret leaves no empty identity behind.
  const returnKey = generateReturnKey();
  const keyHash = hashReturnKey(returnKey);

  const { data: identity, error: identityError } = await supabaseAdmin
    .from("identities")
    .insert({})
    .select("id")
    .single();
  const identityId = unwrap(identity, identityError).id as string;

  const { error: keyError } = await supabaseAdmin
    .from("identity_keys")
    .insert({ identity_id: identityId, kind: "return_key", key_hash: keyHash });

  if (keyError) {
    await deleteIdentity(identityId);
    throw keyError;
  }

  return { identityId, returnKey };
}

// Returns the identity a presented key belongs to, or null if it doesn't match any.
// Malformed input is rejected before touching the database.
export async function resolveIdentityFromReturnKey(key: string): Promise<string | null> {
  if (!isWellFormedReturnKey(key)) return null;

  const { data, error } = await supabaseAdmin
    .from("identity_keys")
    .select("identity_id")
    .eq("kind", "return_key")
    .eq("key_hash", hashReturnKey(key))
    .maybeSingle();

  return unwrap(data, error)?.identity_id ?? null;
}

// Marks a return key as saved (identity_keys.confirmed_at, #212): the person showed they
// kept it before anything depends on it. Only the first confirmation is recorded, so
// confirming again changes nothing. False when the key matches none; malformed input never
// reaches the database.
export async function confirmReturnKey(key: string): Promise<boolean> {
  if (!isWellFormedReturnKey(key)) return false;
  const keyHash = hashReturnKey(key);

  // The app server's clock, as the confirmed_at migration expects.
  const { data: confirmed, error: confirmError } = await supabaseAdmin
    .from("identity_keys")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("kind", "return_key")
    .eq("key_hash", keyHash)
    .is("confirmed_at", null)
    .select("id");
  if (unwrap(confirmed, confirmError).length > 0) return true;

  // Nothing was updated: the key was already confirmed, or there's no such key.
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("identity_keys")
    .select("id")
    .eq("kind", "return_key")
    .eq("key_hash", keyHash)
    .maybeSingle();
  return unwrap(existing, lookupError) !== null;
}

// Whether this identity holds a return key it confirmed. A phrase only accepts letters once
// its author's key is confirmed (correspondences.ts), so no letter is written to someone
// who could never read it.
export async function hasConfirmedReturnKey(identityId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("identity_keys")
    .select("id")
    .eq("identity_id", identityId)
    .eq("kind", "return_key")
    .not("confirmed_at", "is", null)
    .limit(1);
  return unwrap(data, error).length > 0;
}

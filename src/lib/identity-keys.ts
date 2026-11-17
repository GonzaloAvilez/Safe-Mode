import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";

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
const SEAL_PATTERN = /^[0-9]{15}$/;
// What people may type between the digit groups: spaces, hyphens, dots, and the middle dot
// the card shows.
const SEAL_SEPARATORS = /[\s.·-]/g;

// The format before the seal (#209): 32 random bytes as base64url, always 43 characters.
// Still accepted so any key already handed out keeps working; never generated anymore.
const LEGACY_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const MIN_HASH_SECRET_LENGTH = 32;

export function generateReturnKey(): string {
  return Array.from({ length: SEAL_DIGITS }, () => randomInt(10)).join("");
}

// The one form a key is hashed in, however the person typed it: a seal keeps only its
// digits, a legacy key stays as is (it's case-sensitive). null when it's neither.
export function normalizeReturnKey(input: string): string | null {
  const trimmed = input.trim();
  if (LEGACY_KEY_PATTERN.test(trimmed)) return trimmed;

  const digits = trimmed.replace(SEAL_SEPARATORS, "");
  return SEAL_PATTERN.test(digits) ? digits : null;
}

export function isWellFormedReturnKey(key: string): boolean {
  return normalizeReturnKey(key) !== null;
}

// 10^15 seals is about 50 bits: too few for a plain hash, because whoever stole the table
// could hash every possible seal until one matched. So a seal is hashed with HMAC-SHA256 and
// a server secret (a "pepper") that lives in Vercel, never in the database: the table alone
// is useless for guessing. What's left is guessing through the API, and the mailbox and
// letters routes rate-limit that.
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
    await supabaseAdmin.from("identities").delete().eq("id", identityId);
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

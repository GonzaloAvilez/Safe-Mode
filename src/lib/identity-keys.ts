import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";

// ADR-004 layer 3 (#209): anonymous identities and their return keys. Used by both sides
// of a letter: the phrase author and the visitor who writes to them.
//
// A return key is a capability secret: whoever holds it is that identity. Only its hash is
// stored, so a lost key can't be recovered by anyone, the founder included. That's the
// anonymity promise, not a bug.

const KEY_BYTES = 32; // 256 bits
// base64url of 32 bytes, no padding: always 43 chars from [A-Za-z0-9_-].
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateReturnKey(): string {
  return randomBytes(KEY_BYTES).toString("base64url");
}

// Plain SHA-256, not bcrypt/argon2: with 256 bits of entropy a key can't be brute-forced
// from its hash, and a deterministic hash lets verification be one indexed lookup.
export function hashReturnKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isWellFormedReturnKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

// Creates a new anonymous identity with one return key. The raw key is returned exactly
// once, for the caller to show the person; it's never stored or logged.
//
// Two inserts, not one transaction (that would need an RPC, i.e. a migration). If the key
// insert fails, the identity is deleted. If that cleanup also fails, what's left is an
// empty identity with no key, no content and no PII: unreachable and harmless.
export async function createIdentityWithReturnKey(): Promise<{ identityId: string; returnKey: string }> {
  const { data: identity, error: identityError } = await supabaseAdmin
    .from("identities")
    .insert({})
    .select("id")
    .single();
  const identityId = unwrap(identity, identityError).id as string;

  const returnKey = generateReturnKey();
  const { error: keyError } = await supabaseAdmin
    .from("identity_keys")
    .insert({ identity_id: identityId, kind: "return_key", key_hash: hashReturnKey(returnKey) });

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

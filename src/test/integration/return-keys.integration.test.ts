// Runs against a real local Postgres (npm run test:integration), with the
// RETURN_KEY_HASH_SECRET that run-integration-tests.sh exports. Checks what the unit tests
// can't: what actually lands in identity_keys, and that a seal resolves back through
// PostgREST however it's typed.
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmReturnKey,
  createIdentityWithReturnKey,
  hasConfirmedReturnKey,
  resolveIdentityFromReturnKey,
} from "@/lib/identity-keys";
import { supabaseAdmin } from "@/lib/supabase";

let identityIds: string[] = [];

afterEach(async () => {
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  identityIds = [];
});

async function createIdentity(): Promise<{ identityId: string; returnKey: string }> {
  const created = await createIdentityWithReturnKey();
  identityIds.push(created.identityId);
  return created;
}

// The seal as the card shows it: three groups of five digits.
const asOnTheCard = (key: string) => `${key.slice(0, 5)} · ${key.slice(5, 10)} · ${key.slice(10)}`;

describe("return keys (integration)", () => {
  it("stores only the seal's HMAC with the server secret: never the seal, never its plain SHA-256", async () => {
    const { identityId, returnKey } = await createIdentity();

    expect(returnKey).toMatch(/^[0-9]{15}$/);
    const { data, error } = await supabaseAdmin.from("identity_keys").select("*").eq("identity_id", identityId);
    if (error) throw error;

    expect(data).toHaveLength(1);
    const expected = createHmac("sha256", process.env.RETURN_KEY_HASH_SECRET!).update(returnKey).digest("hex");
    expect(data[0].key_hash).toBe(expected);
    expect(data[0].key_hash).not.toBe(createHash("sha256").update(returnKey).digest("hex"));
    expect(JSON.stringify(data[0])).not.toContain(returnKey);
  });

  it.each([
    ["the bare digits", (key: string) => key],
    ["the groups as the card shows them", asOnTheCard],
    ["hyphens between groups", (key: string) => `${key.slice(0, 5)}-${key.slice(5, 10)}-${key.slice(10)}`],
  ])("resolves the seal typed with %s", async (_label, typed) => {
    const { identityId, returnKey } = await createIdentity();

    expect(await resolveIdentityFromReturnKey(typed(returnKey))).toBe(identityId);
  });

  it("doesn't resolve another seal", async () => {
    const { returnKey } = await createIdentity();
    const otherSeal = returnKey.replace(/.$/, (digit) => String((Number(digit) + 1) % 10));

    expect(await resolveIdentityFromReturnKey(otherSeal)).toBeNull();
  });

  it("still resolves a key in the format issued before the seal, stored under its plain SHA-256", async () => {
    const legacyKey = "Zx9_k2Lm-Qw8Rt5Yu1Io3Pa7Sd4Fg6Hj0Kl2Zx9Cv5B";
    const identity = await supabaseAdmin.from("identities").insert({}).select("id").single();
    if (identity.error) throw identity.error;
    identityIds.push(identity.data.id);
    const keyHash = createHash("sha256").update(legacyKey).digest("hex");
    const inserted = await supabaseAdmin
      .from("identity_keys")
      .insert({ identity_id: identity.data.id, kind: "return_key", key_hash: keyHash });
    if (inserted.error) throw inserted.error;

    expect(await resolveIdentityFromReturnKey(legacyKey)).toBe(identity.data.id);
  });
});

async function confirmedAt(identityId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("identity_keys").select("confirmed_at").eq("identity_id", identityId).single();
  if (error) throw error;
  return data.confirmed_at;
}

describe("confirming a return key (integration)", () => {
  it("starts unconfirmed, and confirming it (typed as on the card) records when", async () => {
    const { identityId, returnKey } = await createIdentity();
    expect(await confirmedAt(identityId)).toBeNull();
    expect(await hasConfirmedReturnKey(identityId)).toBe(false);

    expect(await confirmReturnKey(asOnTheCard(returnKey))).toBe(true);

    expect(await confirmedAt(identityId)).not.toBeNull();
    expect(await hasConfirmedReturnKey(identityId)).toBe(true);
  });

  it("keeps the first confirmation when the key is confirmed again", async () => {
    const { identityId, returnKey } = await createIdentity();
    await confirmReturnKey(returnKey);
    const first = await confirmedAt(identityId);

    expect(await confirmReturnKey(returnKey)).toBe(true);

    expect(await confirmedAt(identityId)).toBe(first);
  });

  it("answers false for a seal that isn't a key, and confirms nothing", async () => {
    const { identityId, returnKey } = await createIdentity();
    const otherSeal = returnKey.replace(/.$/, (digit) => String((Number(digit) + 1) % 10));

    expect(await confirmReturnKey(otherSeal)).toBe(false);

    expect(await confirmedAt(identityId)).toBeNull();
  });
});

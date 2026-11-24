// Runs against a real local Postgres (npm run test:integration). ADR-005's push_subscriptions
// rules (one row per identity per device, rows that go with their identity, the column checks)
// live in the database itself, so only a real database can prove them.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";

let identityIds: string[] = [];

// Deleting the identities also removes their subscriptions (on delete cascade).
afterEach(async () => {
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  identityIds = [];
});

async function createIdentity(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("identities").insert({}).select("id").single();
  if (error) throw error;
  identityIds.push(data.id);
  return data.id;
}

function uniqueEndpoint(): string {
  return `https://push.example.test/send/${crypto.randomUUID()}`;
}

function subscription(identityId: string, endpoint: string, overrides: Record<string, string> = {}) {
  return { identity_id: identityId, endpoint, p256dh: "p256dh-key", auth: "auth-secret", locale: "es", ...overrides };
}

async function rowsFor(endpoint: string) {
  const { data, error } = await supabaseAdmin.from("push_subscriptions").select("identity_id, locale, p256dh").eq("endpoint", endpoint);
  if (error) throw error;
  return data;
}

describe("push_subscriptions schema (integration)", () => {
  it("lets two identities share one device", async () => {
    const [first, second] = [await createIdentity(), await createIdentity()];
    const endpoint = uniqueEndpoint();

    const { error } = await supabaseAdmin.from("push_subscriptions").insert([subscription(first, endpoint), subscription(second, endpoint)]);

    expect(error).toBeNull();
    expect(await rowsFor(endpoint)).toHaveLength(2);
  });

  it("rejects the same identity on the same device twice", async () => {
    const identityId = await createIdentity();
    const endpoint = uniqueEndpoint();
    await supabaseAdmin.from("push_subscriptions").insert(subscription(identityId, endpoint));

    const { error } = await supabaseAdmin.from("push_subscriptions").insert(subscription(identityId, endpoint));

    expect(error).not.toBeNull();
  });

  // The upsert the subscription route will use: subscribing again from the same device updates
  // the row in place instead of adding another.
  it("updates the row in place when the same identity subscribes again from the same device", async () => {
    const identityId = await createIdentity();
    const endpoint = uniqueEndpoint();
    await supabaseAdmin.from("push_subscriptions").insert(subscription(identityId, endpoint));

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(subscription(identityId, endpoint, { p256dh: "new-key", locale: "en" }), { onConflict: "identity_id,endpoint" });

    expect(error).toBeNull();
    expect(await rowsFor(endpoint)).toEqual([{ identity_id: identityId, locale: "en", p256dh: "new-key" }]);
  });

  it("deleting an identity removes only its rows, even on a shared device", async () => {
    const [leaving, staying] = [await createIdentity(), await createIdentity()];
    const endpoint = uniqueEndpoint();
    await supabaseAdmin.from("push_subscriptions").insert([subscription(leaving, endpoint), subscription(staying, endpoint)]);

    await supabaseAdmin.from("identities").delete().eq("id", leaving);

    expect(await rowsFor(endpoint)).toEqual([{ identity_id: staying, locale: "es", p256dh: "p256dh-key" }]);
  });

  // What a 404/410 from the push service does (ADR-005): the device is gone for every identity.
  it("deleting by endpoint removes the device for every identity, and nothing else", async () => {
    const [first, second] = [await createIdentity(), await createIdentity()];
    const [gone, other] = [uniqueEndpoint(), uniqueEndpoint()];
    await supabaseAdmin
      .from("push_subscriptions")
      .insert([subscription(first, gone), subscription(second, gone), subscription(first, other)]);

    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", gone);

    expect(await rowsFor(gone)).toEqual([]);
    expect(await rowsFor(other)).toHaveLength(1);
  });

  it.each([
    ["an endpoint that isn't https", { endpoint: "http://push.example.test/send/x" }],
    ["an empty p256dh key", { p256dh: "" }],
    ["an empty auth secret", { auth: "" }],
    ["an empty locale", { locale: "" }],
    ["a locale with surrounding spaces", { locale: " es " }],
  ])("rejects %s", async (_, overrides) => {
    const identityId = await createIdentity();

    const { error } = await supabaseAdmin.from("push_subscriptions").insert(subscription(identityId, uniqueEndpoint(), overrides));

    expect(error).not.toBeNull();
  });

  it("rejects a subscription for an identity that doesn't exist", async () => {
    const { error } = await supabaseAdmin.from("push_subscriptions").insert(subscription(crypto.randomUUID(), uniqueEndpoint()));

    expect(error).not.toBeNull();
  });
});

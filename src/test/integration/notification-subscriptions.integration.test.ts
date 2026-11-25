// Runs against a real local Postgres (npm run test:integration). The functions the subscription
// route and the web-push channel use (ADR-005), against the real push_subscriptions table: the
// upsert's conflict target, and which rows each delete reaches.
import { afterEach, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isPushSubscribed,
  listPushSubscriptions,
  removePushEndpoint,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/notifications/push-subscriptions";

let identityIds: string[] = [];

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

const device = () => ({ endpoint: `https://push.example.test/send/${crypto.randomUUID()}`, p256dh: "p256dh-key", auth: "auth-secret" });

describe("push subscriptions (integration)", () => {
  it("subscribing again from the same device updates it instead of adding another", async () => {
    const identityId = await createIdentity();
    const phone = device();

    await savePushSubscription(identityId, phone, "es");
    await savePushSubscription(identityId, { ...phone, p256dh: "rotated-key" }, "en");

    expect(await listPushSubscriptions(identityId)).toEqual([{ ...phone, p256dh: "rotated-key", locale: "en" }]);
  });

  it("lists every device of an identity, and only its own", async () => {
    const [identityId, someoneElse] = [await createIdentity(), await createIdentity()];
    const [phone, laptop] = [device(), device()];
    await savePushSubscription(identityId, phone, "es");
    await savePushSubscription(identityId, laptop, "en");
    await savePushSubscription(someoneElse, device(), "es");

    const listed = await listPushSubscriptions(identityId);

    expect(listed.map((row) => row.endpoint).sort()).toEqual([phone.endpoint, laptop.endpoint].sort());
  });

  // What the toggle shows (ADR-005): only this identity's row on this device counts.
  it("says whether an identity asked for notices on a device, not whether anyone on it did", async () => {
    const [identityId, someoneElse] = [await createIdentity(), await createIdentity()];
    const [shared, other] = [device(), device()];
    await savePushSubscription(someoneElse, shared, "es");

    expect(await isPushSubscribed(identityId, shared.endpoint)).toBe(false);
    await savePushSubscription(identityId, shared, "es");
    expect(await isPushSubscribed(identityId, shared.endpoint)).toBe(true);
    expect(await isPushSubscribed(identityId, other.endpoint)).toBe(false);
  });

  // Opting out is per identity (ADR-005): two identities on one device are independent.
  it("opting out removes only that identity's row on a shared device", async () => {
    const [leaving, staying] = [await createIdentity(), await createIdentity()];
    const shared = device();
    await savePushSubscription(leaving, shared, "es");
    await savePushSubscription(staying, shared, "es");

    await removePushSubscription(leaving, shared.endpoint);

    expect(await listPushSubscriptions(leaving)).toEqual([]);
    expect(await listPushSubscriptions(staying)).toHaveLength(1);
  });

  // A 404/410 from the push service: the device is gone for everyone on it, and nothing else goes.
  it("removing a gone endpoint clears it for every identity and leaves their other devices", async () => {
    const [first, second] = [await createIdentity(), await createIdentity()];
    const [gone, laptop] = [device(), device()];
    await savePushSubscription(first, gone, "es");
    await savePushSubscription(second, gone, "en");
    await savePushSubscription(first, laptop, "es");

    await removePushEndpoint(gone.endpoint);

    expect((await listPushSubscriptions(first)).map((row) => row.endpoint)).toEqual([laptop.endpoint]);
    expect(await listPushSubscriptions(second)).toEqual([]);
  });
});

import { createVisitorReturnKey } from "@/lib/correspondences";
import { confirmReturnKey, resolveIdentityFromReturnKey } from "@/lib/identity-keys";

// A visitor's side of design B (#212), as Mirror does it before writing: ask for a seal for
// the entry that matched, then confirm it was kept. Returns the seal and its identity, so the
// test can clean the identity up.
export async function keepVisitorSeal(entryId: string, sessionId: string): Promise<{ returnKey: string; identityId: string }> {
  const result = await createVisitorReturnKey({ entryId, sessionId });
  if (result.type !== "created") throw new Error(`expected a seal, got ${result.type}`);

  if (!(await confirmReturnKey(result.returnKey))) throw new Error("the new seal couldn't be confirmed");
  const identityId = await resolveIdentityFromReturnKey(result.returnKey);
  if (!identityId) throw new Error("the new seal resolves to no identity");

  return { returnKey: result.returnKey, identityId };
}

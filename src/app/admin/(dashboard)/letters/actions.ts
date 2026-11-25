"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { approveLetter, rejectLetter } from "@/lib/letter-review";
import { notify } from "@/lib/notifications/notify";

function getId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" ? id : null;
}

// One click each, same as approving/rejecting phrases (only deleting asks to confirm).
// A second click on an already-decided letter is a no-op (approveLetter/rejectLetter
// only touch letters that are still held).

export async function approveLetterAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  const result = await approveLetter(id);
  // ADR-005: the person the letter is for hears about it. after() keeps the function alive until
  // the notice is sent, without making the founder wait, and a failed notice leaves the letter
  // delivered. Only the approval that delivered the letter gets here, so a double click sends one.
  if (result.ok && result.recipientIdentityId) {
    const recipientIdentityId = result.recipientIdentityId;
    after(() => notify(recipientIdentityId, "letter_delivered"));
  }
  revalidatePath("/admin/letters");
}

export async function rejectLetterAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await rejectLetter(id);
  revalidatePath("/admin/letters");
}

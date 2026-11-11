"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { approveLetter, rejectLetter } from "@/lib/letter-review";

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
  await approveLetter(id);
  revalidatePath("/admin/letters");
}

export async function rejectLetterAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await rejectLetter(id);
  revalidatePath("/admin/letters");
}

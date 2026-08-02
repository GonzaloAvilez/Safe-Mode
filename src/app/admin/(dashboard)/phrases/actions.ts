"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { approvePhrase, rejectPhrase, setPhraseActive } from "@/lib/phrases";
import { classifyPhraseNarrative } from "@/lib/phrase-narratives";

function getId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" ? id : null;
}

export async function approvePhraseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await approvePhrase(id);
  revalidatePath("/admin/phrases");
}

export async function rejectPhraseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await rejectPhrase(id);
  revalidatePath("/admin/phrases");
}

export async function activatePhraseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await setPhraseActive(id, true);
  revalidatePath("/admin/phrases");
}

export async function deactivatePhraseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await setPhraseActive(id, false);
  revalidatePath("/admin/phrases");
}

// Part of the public-narrative experiment (see docs/workshop-updates) — manual,
// one phrase at a time, same posture as the rest of this panel.
export async function classifyPhraseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id) return;
  await classifyPhraseNarrative(id);
  revalidatePath("/admin/phrases");
}

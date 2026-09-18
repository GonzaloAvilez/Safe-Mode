"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { approvePhrase, rejectPhrase, setPhraseActive, deletePhrase } from "@/lib/phrases";
import { classifyPhraseNarrative } from "@/lib/phrase-narratives";

function getId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" ? id : null;
}

export type DeletePhraseState = { error?: string; deleted?: boolean };

export async function deletePhraseAction(
  _previousState: DeletePhraseState,
  formData: FormData
): Promise<DeletePhraseState> {
  await requireAdminSession();
  const id = getId(formData);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "No se pudo identificar la frase. Recarga la página e inténtalo de nuevo." };
  }
  try {
    await deletePhrase(id);
  } catch {
    return { error: "No se pudo eliminar la frase. Inténtalo de nuevo." };
  }
  revalidatePath("/admin/phrases");
  return { deleted: true };
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

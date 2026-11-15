"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { submitSeedPhraseLetter } from "@/lib/correspondences";
import { LETTER_MAX_LENGTH, type SubmitLetterResult } from "@/lib/letters";
import { isUuid } from "@/lib/uuid";

export type SeedPhraseLetterState = { result?: SubmitLetterResult; error?: string };

// The founder's letter as the author of a seed phrase (ADR-004). It goes through the
// same safety pipeline and review as any letter (founder decision 2026-11-14), so a
// letter that passes waits in /admin/letters like the rest.
export async function submitSeedPhraseLetterAction(
  _previousState: SeedPhraseLetterState,
  formData: FormData
): Promise<SeedPhraseLetterState> {
  await requireAdminSession();

  const correspondenceId = formData.get("correspondenceId");
  if (!isUuid(correspondenceId)) {
    return { error: "No se pudo identificar la correspondencia. Recarga la página e inténtalo de nuevo." };
  }

  // Same rule textLengthGuard applies to visitors' and authors' letters.
  const text = formData.get("text");
  if (typeof text !== "string" || text.trim().length === 0 || text.length > LETTER_MAX_LENGTH) {
    return { error: `La carta no puede estar vacía ni pasar de ${LETTER_MAX_LENGTH} caracteres.` };
  }

  let result: SubmitLetterResult;
  try {
    result = await submitSeedPhraseLetter({ correspondenceId, body: text });
  } catch {
    // Nothing was stored (e.g. the moderation call failed, fail-closed): safe to retry.
    return { error: "No se pudo enviar la carta. Inténtalo de nuevo." };
  }

  // The new held letter shows in both: here as yours, in Letters as one to review.
  revalidatePath("/admin/mailbox");
  revalidatePath("/admin/letters");
  return { result };
}

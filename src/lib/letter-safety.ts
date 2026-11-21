import "server-only";
import { moderateText } from "@/lib/openai";
import { resolveModerationFlags, type ModerationFlags } from "@/lib/safety/moderation-flags";
import { detectContactInfo, type ContactInfoKind, type ContactInfoResult } from "@/lib/safety/contact-info";

// ADR-004 #210, part C: the safety pipeline every letter goes through before it can wait
// for human review (ADR-004 "Letter rules"). Order matters:
//   1. moderation: crisis first, because the sender needs help resources even if the letter
//      also carries contact info; then directed aggression
//   2. contact info (detectContactInfo)
//   3. anything that passes waits as "held" for the founder
//
// Step 1 used to reject on any general moderation flag. It doesn't anymore (#265): that
// refused grief for describing how someone died, before the human review this pipeline
// exists to feed. Only aggression aimed at a person rejects now — see directed-aggression.ts.
//
// Fail-closed: if the moderation call throws, the error propagates and nothing is stored.

export type LetterSafetyOutcome =
  | { outcome: "held" }
  | { outcome: "rejected"; reason: "crisis" }
  | { outcome: "rejected"; reason: "moderation" }
  | { outcome: "rejected"; reason: "contact_info"; contactKinds: ContactInfoKind[] };

// The decision alone, without the API call, so the order can be tested exhaustively.
// Takes only the two flags it reads: `flaggedGeneral` is deliberately not one of them (#265).
export function resolveLetterSafetyOutcome(
  flags: Pick<ModerationFlags, "flaggedCrisis" | "flaggedDirectedAggression">,
  contact: ContactInfoResult
): LetterSafetyOutcome {
  if (flags.flaggedCrisis) return { outcome: "rejected", reason: "crisis" };
  if (flags.flaggedDirectedAggression) return { outcome: "rejected", reason: "moderation" };
  if (contact.found) return { outcome: "rejected", reason: "contact_info", contactKinds: contact.kinds };
  return { outcome: "held" };
}

export async function checkLetterSafety(body: string): Promise<LetterSafetyOutcome> {
  const flags = resolveModerationFlags(await moderateText(body));
  return resolveLetterSafetyOutcome(flags, detectContactInfo(body));
}

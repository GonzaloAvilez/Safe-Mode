import "server-only";
import { moderateText } from "@/lib/openai";
import { resolveModerationFlags, type ModerationFlags } from "@/lib/safety/moderation-flags";
import { detectContactInfo, type ContactInfoKind, type ContactInfoResult } from "@/lib/safety/contact-info";

// ADR-004 #210, part C: the safety pipeline every letter goes through before it can wait
// for human review (ADR-004 "Letter rules"). Order matters:
//   1. moderation: crisis first, because the sender needs help resources even if the letter
//      also carries contact info; then general moderation
//   2. contact info (detectContactInfo)
//   3. anything that passes waits as "held" for the founder
//
// Fail-closed: if the moderation call throws, the error propagates and nothing is stored.

export type LetterScreening =
  | { outcome: "held" }
  | { outcome: "rejected"; reason: "crisis" }
  | { outcome: "rejected"; reason: "moderation" }
  | { outcome: "rejected"; reason: "contact_info"; contactKinds: ContactInfoKind[] };

// The decision alone, without the API call, so the order can be tested exhaustively.
export function resolveLetterScreening(flags: ModerationFlags, contact: ContactInfoResult): LetterScreening {
  if (flags.flaggedCrisis) return { outcome: "rejected", reason: "crisis" };
  if (flags.flaggedGeneral) return { outcome: "rejected", reason: "moderation" };
  if (contact.found) return { outcome: "rejected", reason: "contact_info", contactKinds: contact.kinds };
  return { outcome: "held" };
}

export async function screenLetter(body: string): Promise<LetterScreening> {
  const flags = resolveModerationFlags(await moderateText(body));
  return resolveLetterScreening(flags, detectContactInfo(body));
}

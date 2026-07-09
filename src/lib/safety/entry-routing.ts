import type { ModerationFlags } from "@/lib/safety/moderation-flags";

export type EntryRoute = "crisis" | "general_flagged" | "cap_reached" | "proceed";

// Moderation-first order: crisis always wins, then general moderation, only then the spend cap.
// Never spend on an embedding for content that's already been rejected for another reason.
export function resolveEntryRoute(flags: ModerationFlags, withinDailyCap: boolean): EntryRoute {
  if (flags.flaggedCrisis) return "crisis";
  if (flags.flaggedGeneral) return "general_flagged";
  if (!withinDailyCap) return "cap_reached";
  return "proceed";
}

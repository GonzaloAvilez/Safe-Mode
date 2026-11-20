import type { ModerationFlags } from "@/lib/safety/moderation-flags";

export type EntryRoute = "crisis" | "cap_reached" | "proceed";

// Crisis always wins, then the spend cap. A general moderation flag doesn't stop an entry
// (#261): entries are never shown to anyone, so blocking one protects nobody, and OpenAI's
// categories can't tell telling what happened to you apart from hurting someone. Grief,
// abuse survivors and domestic violence all get flagged. The flag is still recorded, so
// /admin/flagged still shows these entries, but routing ignores it.
export function resolveEntryRoute(flags: ModerationFlags, withinDailyCap: boolean): EntryRoute {
  if (flags.flaggedCrisis) return "crisis";
  if (!withinDailyCap) return "cap_reached";
  return "proceed";
}

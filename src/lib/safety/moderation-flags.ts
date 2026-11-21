import { hasAutoRejectLetterCategory, type ModerationCategory } from "@/lib/safety/letter-auto-reject";
import { shouldTriggerCrisisFlow } from "@/lib/safety/moderation-gate";
import type { SelfHarmScores } from "@/lib/safety/moderation-gate";

export type ModerationFlags = {
  // Self-harm categories only, our conservative threshold. Redirects to findahelpline.com, flow stops.
  flaggedCrisis: boolean;
  // Any other moderated category (violence, harassment, sexual, etc). Recorded, not a verdict:
  // since #261 it no longer stops an entry, and since #265 it no longer rejects a letter either.
  // It survives because /admin/flagged is how the founder sees what moderation reacted to.
  flaggedGeneral: boolean;
  // The narrower signal letters reject on: the text fell in a category a letter is refused
  // for without human review. See letter-auto-reject.ts for which ones, and why.
  flaggedLetterAutoReject: boolean;
};

export function resolveModerationFlags(moderation: {
  flagged: boolean;
  flaggedCategories: readonly ModerationCategory[];
  selfHarmScores: SelfHarmScores;
}): ModerationFlags {
  const flaggedCrisis = shouldTriggerCrisisFlow(moderation.selfHarmScores);

  return {
    flaggedCrisis,
    flaggedGeneral: moderation.flagged && !flaggedCrisis,
    flaggedLetterAutoReject: !flaggedCrisis && hasAutoRejectLetterCategory(moderation.flaggedCategories),
  };
}

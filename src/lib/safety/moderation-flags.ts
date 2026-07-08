import { shouldTriggerCrisisFlow } from "@/lib/safety/moderation-gate";
import type { SelfHarmScores } from "@/lib/safety/moderation-gate";

export type ModerationFlags = {
  // Self-harm categories only, our conservative threshold. Redirects to findahelpline.com, flow stops.
  flaggedCrisis: boolean;
  // Any other moderated category (violence, harassment, sexual, etc). Shows a different, non-crisis message.
  flaggedGeneral: boolean;
};

export function resolveModerationFlags(moderation: {
  flagged: boolean;
  selfHarmScores: SelfHarmScores;
}): ModerationFlags {
  const flaggedCrisis = shouldTriggerCrisisFlow(moderation.selfHarmScores);

  return {
    flaggedCrisis,
    flaggedGeneral: moderation.flagged && !flaggedCrisis,
  };
}

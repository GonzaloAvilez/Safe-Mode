import { shouldTriggerCrisisFlow } from "@/lib/safety/moderation-gate";
import type { SelfHarmScores } from "@/lib/safety/moderation-gate";

export type PhraseModerationStatus = "pending" | "approved" | "rejected";

// Organic growth: the corpus adds itself automatically off OpenAI's verdict, no human
// gate before publish. /admin/phrases is an audit tool, not an approval queue — a human
// can still approve/reject/activate/deactivate anything after the fact.
//
// Also applies the same conservative self-harm threshold entries use to trigger their
// crisis flow (see moderation-gate.ts) — phrases publish into the shared public corpus,
// so they warrant at least as much scrutiny as a private, one-off entry, not less.
// Previously this only checked the raw `flagged` boolean and missed that extra layer
// entirely, a real gap found 2026-07-13 while reviewing how well auto-moderation held up.
export function resolvePhraseModerationStatus(moderation: {
  flagged: boolean;
  selfHarmScores: SelfHarmScores;
}): PhraseModerationStatus {
  if (moderation.flagged || shouldTriggerCrisisFlow(moderation.selfHarmScores)) {
    return "rejected";
  }
  return "approved";
}

export function shouldActivatePhrase(status: PhraseModerationStatus): boolean {
  return status === "approved";
}

// Conservative: low threshold, errs toward triggering the crisis flow.
export const CRISIS_THRESHOLD = 0.2;

export type SelfHarmScores = {
  "self-harm": number;
  "self-harm/intent": number;
  "self-harm/instructions": number;
};

export function shouldTriggerCrisisFlow(
  scores: SelfHarmScores,
  threshold: number = CRISIS_THRESHOLD
): boolean {
  return Object.values(scores).some((score) => score >= threshold);
}

export type PhraseModerationStatus = "pending" | "approved" | "rejected";

// Organic growth: the corpus adds itself automatically off OpenAI's verdict, no human
// gate before publish. /admin/phrases is an audit tool, not an approval queue — a human
// can still approve/reject/activate/deactivate anything after the fact.
export function resolvePhraseModerationStatus(moderation: { flagged: boolean }): PhraseModerationStatus {
  return moderation.flagged ? "rejected" : "approved";
}

export function shouldActivatePhrase(status: PhraseModerationStatus): boolean {
  return status === "approved";
}

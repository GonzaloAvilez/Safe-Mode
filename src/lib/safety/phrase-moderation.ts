export type PhraseModerationStatus = "pending" | "approved" | "rejected";

export function resolvePhraseModerationStatus(moderation: { flagged: boolean }): PhraseModerationStatus {
  return moderation.flagged ? "rejected" : "approved";
}

export function shouldActivatePhrase(status: PhraseModerationStatus): boolean {
  return status === "approved";
}

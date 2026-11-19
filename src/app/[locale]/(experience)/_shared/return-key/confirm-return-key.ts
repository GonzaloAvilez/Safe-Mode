// Tells the server the author kept their seal (POST /api/return-key/confirm, #245). Only from
// then on does their phrase accept letters, so letters never reach someone who can't read them.
// The seal goes in the Authorization header, never in the URL or the body.

export type ConfirmReturnKeyResult = { type: "confirmed" } | { type: "error"; reason: "too_many" | "failed" | "offline" };

export async function confirmReturnKey(returnKey: string): Promise<ConfirmReturnKeyResult> {
  try {
    const response = await fetch("/api/return-key/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${returnKey}` },
    });
    if (response.status === 204) return { type: "confirmed" };
    return { type: "error", reason: response.status === 429 ? "too_many" : "failed" };
  } catch {
    return { type: "error", reason: "offline" };
  }
}

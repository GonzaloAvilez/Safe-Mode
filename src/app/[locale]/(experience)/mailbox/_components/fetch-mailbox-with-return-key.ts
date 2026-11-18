import type { Mailbox } from "@/lib/mailbox";

// ADR-004 #213: fetches the mailbox a seal belongs to (GET /api/mailbox, #211). Only the request:
// opening the mailbox on screen (the state that shows it) is ShowSealStep's. The seal goes in the
// Authorization header, never in the URL, and the answer is never cached: it carries private
// letters.

export type FetchMailboxResult =
  | { type: "opened"; mailbox: Mailbox }
  | { type: "not_recognized" } // no mailbox opens with this seal
  | { type: "error"; reason: "too_many" | "failed" | "offline" };

function isMailbox(value: unknown): value is Mailbox {
  return typeof value === "object" && value !== null && Array.isArray((value as Mailbox).correspondences);
}

export async function fetchMailboxWithReturnKey(returnKey: string): Promise<FetchMailboxResult> {
  let response: Response;
  try {
    response = await fetch("/api/mailbox", {
      headers: { Authorization: `Bearer ${returnKey}` },
      cache: "no-store",
    });
  } catch {
    return { type: "error", reason: "offline" };
  }

  if (response.status === 401) return { type: "not_recognized" };
  if (response.status === 429) return { type: "error", reason: "too_many" };
  if (!response.ok) return { type: "error", reason: "failed" };

  try {
    const body: unknown = await response.json();
    return isMailbox(body) ? { type: "opened", mailbox: body } : { type: "error", reason: "failed" };
  } catch {
    return { type: "error", reason: "failed" };
  }
}

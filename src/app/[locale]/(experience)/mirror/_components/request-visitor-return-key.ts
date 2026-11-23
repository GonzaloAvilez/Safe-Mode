import { parseSeal } from "@/lib/parse-seal";
import type { ReturnKeyWithSentence } from "@/app/_components/experience-state/ritual";

// ADR-004 #212, seal first (design B): asks the server for the visitor's seal before they write
// (POST /api/return-key). The entry only proves they may ask: their entry matched this phrase in
// this visit, and letters can reach its author. The seal comes back once, with the gift sentence
// for its card; it starts unconfirmed, and lives only in memory from here on.

export type RequestVisitorReturnKeyResult =
  | ({ type: "created" } & ReturnKeyWithSentence)
  // This phrase can't receive letters (anymore), or the entry no longer counts.
  | { type: "unavailable" }
  | { type: "letters_closed" }
  | { type: "error"; reason: "too_many" | "failed" | "offline" };

type RequestVisitorReturnKeyInput = { entryId: string; locale: string };

const FAILED: RequestVisitorReturnKeyResult = { type: "error", reason: "failed" };

// The seal and its sentence in a 201, or null when the body isn't that: a seal that isn't exactly
// 15 digits is never shown, because it could never open anything.
function readCreatedSeal(body: unknown): ReturnKeyWithSentence | null {
  if (typeof body !== "object" || body === null) return null;
  const { returnKey, returnKeySentence } = body as { returnKey?: unknown; returnKeySentence?: unknown };
  if (typeof returnKey !== "string" || typeof returnKeySentence !== "string") return null;
  if (parseSeal(returnKey) !== returnKey) return null;
  return { returnKey, sentence: returnKeySentence };
}

export async function requestVisitorReturnKey(input: RequestVisitorReturnKeyInput): Promise<RequestVisitorReturnKeyResult> {
  let response: Response;
  try {
    response = await fetch("/api/return-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: input.entryId, locale: input.locale }),
    });
  } catch {
    return { type: "error", reason: "offline" };
  }

  if (response.status === 201) {
    const seal = readCreatedSeal(await response.json().catch(() => null));
    return seal ? { type: "created", ...seal } : FAILED;
  }
  if (response.status === 404 || response.status === 403) return { type: "unavailable" };
  if (response.status === 503) return { type: "letters_closed" };
  if (response.status === 429) return { type: "error", reason: "too_many" };
  return FAILED;
}

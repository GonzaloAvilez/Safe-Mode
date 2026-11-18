// ADR-004 #213: sends the next letter of a correspondence (POST /api/correspondences/[id]/letters,
// #211). The seal goes in the Authorization header only; the body carries the letter and the
// anti-bot fields. What comes back says what happened to the letter: waiting for review, or not
// sent and why (the server's safety pipeline, ADR-004 "Letter rules").

// The longest letter the server accepts (LETTER_MAX_LENGTH in src/lib/letters.ts, which is
// server-only; a test keeps the two equal).
export const LETTER_MAX_CHARACTERS = 1200;

export type LetterContactKind = "email" | "url" | "phone" | "handle";

const CONTACT_KINDS: readonly LetterContactKind[] = ["email", "url", "phone", "handle"];

export type SendLetterResult =
  | { type: "held" } // on its way: a person reads it before delivering it, up to 48 hours
  | { type: "crisis" } // not sent; the person gets help resources instead
  | { type: "rejected"; reason: "moderation" }
  | { type: "rejected"; reason: "contact_info"; contactKinds: LetterContactKind[] }
  | { type: "not_allowed" } // not this side's turn anymore (another tab, a letter in review)
  | { type: "not_recognized" } // the seal no longer opens this correspondence
  | { type: "letters_closed" } // the founder paused letters
  | { type: "error"; reason: "too_many" | "failed" | "offline" };

export type SendLetterInput = {
  correspondenceId: string;
  returnKey: string;
  text: string;
  honeypot: string;
  formRenderedAt: number;
};

function isContactKind(value: unknown): value is LetterContactKind {
  return CONTACT_KINDS.includes(value as LetterContactKind);
}

// A 201 says a letter was written; its body says what became of it.
function fromWrittenLetter(body: unknown): SendLetterResult {
  const answer = (body ?? {}) as { type?: unknown; reason?: unknown; contactKinds?: unknown };
  if (answer.type === "held") return { type: "held" };
  if (answer.type === "crisis") return { type: "crisis" };
  if (answer.type === "rejected" && answer.reason === "moderation") return { type: "rejected", reason: "moderation" };
  if (answer.type === "rejected" && answer.reason === "contact_info" && Array.isArray(answer.contactKinds)) {
    const contactKinds = answer.contactKinds.filter(isContactKind);
    if (contactKinds.length > 0) return { type: "rejected", reason: "contact_info", contactKinds };
  }
  return { type: "error", reason: "failed" };
}

export async function sendLetter(input: SendLetterInput): Promise<SendLetterResult> {
  let response: Response;
  try {
    response = await fetch(`/api/correspondences/${encodeURIComponent(input.correspondenceId)}/letters`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.returnKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text, honeypot: input.honeypot, formRenderedAt: input.formRenderedAt }),
    });
  } catch {
    return { type: "error", reason: "offline" };
  }

  if (response.status === 201) return fromWrittenLetter(await response.json().catch(() => null));
  if (response.status === 409) return { type: "not_allowed" };
  if (response.status === 401 || response.status === 404) return { type: "not_recognized" };
  if (response.status === 503) return { type: "letters_closed" };
  if (response.status === 429) return { type: "error", reason: "too_many" };
  return { type: "error", reason: "failed" };
}

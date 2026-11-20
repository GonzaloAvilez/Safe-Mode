import type { SubmitLetterResult } from "@/lib/letters";
import type { ContactInfoKind } from "@/lib/safety/contact-info";

// ADR-004 #213: sends the next letter of a correspondence (POST /api/correspondences/[id]/letters,
// #211). The seal goes in the Authorization header only; the body carries the letter and the
// anti-bot fields. What comes back says what happened to the letter: waiting for review, or not
// sent and why (the server's safety pipeline, ADR-004 "Letter rules").
//
// What the server can answer is read from the server's own types (SubmitLetterResult,
// ContactInfoKind), not a copy of them: a result or a contact kind added there fails the build
// here until this screen knows what to show for it.

export type LetterContactKind = ContactInfoKind;

// Every kind of contact the server can find, each listed once (`satisfies` fails the build if the
// server's list changes).
export const LETTER_CONTACT_KINDS = Object.keys({
  email: true,
  url: true,
  phone: true,
  handle: true,
} satisfies Record<ContactInfoKind, true>) as ContactInfoKind[];

// Every result the server can give for a letter, the same way.
const SERVER_RESULT_TYPES = Object.keys({
  held: true,
  crisis: true,
  rejected: true,
  not_allowed: true,
  not_found: true,
} satisfies Record<SubmitLetterResult["type"], true>) as SubmitLetterResult["type"][];

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

const FAILED: SendLetterResult = { type: "error", reason: "failed" };

function isContactKind(value: unknown): value is LetterContactKind {
  return LETTER_CONTACT_KINDS.includes(value as LetterContactKind);
}

// What the screen shows for each result the server can give. The `never` branches make a result
// (or a rejection reason) the server gains a build error here, not a silent fallback.
function fromServerResult(result: SubmitLetterResult): SendLetterResult {
  switch (result.type) {
    case "held":
      return { type: "held" };
    case "crisis":
      return { type: "crisis" };
    case "rejected":
      switch (result.reason) {
        case "moderation":
          return { type: "rejected", reason: "moderation" };
        case "contact_info": {
          // The kinds are shown to the person: only the ones this screen can name.
          const contactKinds = Array.isArray(result.contactKinds) ? result.contactKinds.filter(isContactKind) : [];
          return contactKinds.length > 0 ? { type: "rejected", reason: "contact_info", contactKinds } : FAILED;
        }
        default: {
          const unhandled: never = result;
          void unhandled;
          return FAILED;
        }
      }
    case "not_allowed":
      return { type: "not_allowed" };
    case "not_found":
      return { type: "not_recognized" };
    default: {
      const unhandled: never = result;
      void unhandled;
      return FAILED;
    }
  }
}

// The body of an answer the route gives with a SubmitLetterResult (201, 404, 409), or null when
// it isn't one: an unknown type is never guessed at.
function readServerResult(body: unknown): SubmitLetterResult | null {
  if (typeof body !== "object" || body === null) return null;
  const type = (body as { type?: unknown }).type;
  return SERVER_RESULT_TYPES.includes(type as SubmitLetterResult["type"]) ? (body as SubmitLetterResult) : null;
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

  if (response.status === 201 || response.status === 404 || response.status === 409) {
    const result = readServerResult(await response.json().catch(() => null));
    if (result) return fromServerResult(result);
    // No readable result: the status alone still says enough for these two.
    if (response.status === 409) return { type: "not_allowed" };
    if (response.status === 404) return { type: "not_recognized" };
    return FAILED;
  }
  if (response.status === 401) return { type: "not_recognized" };
  if (response.status === 503) return { type: "letters_closed" };
  if (response.status === 429) return { type: "error", reason: "too_many" };
  return FAILED;
}

// ADR-004 #211 and #212: the visitor's first letter, from Mirror (POST /api/correspondences), with
// the seal they just kept and confirmed. Trying again with the same seal writes into the same
// correspondence, so a paper that came back can simply be sent again.
export type SendFirstLetterResult =
  | { type: "held" }
  | { type: "crisis" }
  | { type: "rejected"; reason: "moderation" }
  | { type: "rejected"; reason: "contact_info"; contactKinds: LetterContactKind[] }
  // A letter of theirs to this phrase already left (another tab, a double send): nothing to
  // write now, their letter is on its way.
  | { type: "already_on_its_way" }
  // This phrase can't receive their letter anymore (its author let go of letters, or the entry
  // or seal no longer counts).
  | { type: "unavailable" }
  | { type: "letters_closed" }
  | { type: "error"; reason: "too_many" | "failed" | "offline" };

const FIRST_LETTER_FAILED: SendFirstLetterResult = { type: "error", reason: "failed" };

export type SendFirstLetterInput = {
  entryId: string;
  returnKey: string;
  text: string;
  honeypot: string;
  formRenderedAt: number;
};

function fromFirstLetterResult(letter: SubmitLetterResult): SendFirstLetterResult {
  const result = fromServerResult(letter);
  switch (result.type) {
    case "held":
    case "crisis":
    case "rejected":
    case "error":
      return result;
    // Any turn rule: their correspondence with this phrase already holds a letter of theirs.
    case "not_allowed":
      return { type: "already_on_its_way" };
    default:
      return FIRST_LETTER_FAILED;
  }
}

// The letter inside a 201 from POST /api/correspondences ({ type: "started", correspondenceId,
// letter }), or null when the body isn't that.
function readStartedLetter(body: unknown): SubmitLetterResult | null {
  if (typeof body !== "object" || body === null) return null;
  const started = body as { type?: unknown; correspondenceId?: unknown; letter?: unknown };
  if (started.type !== "started" || typeof started.correspondenceId !== "string") return null;
  return readServerResult(started.letter);
}

export async function sendFirstLetter(input: SendFirstLetterInput): Promise<SendFirstLetterResult> {
  let response: Response;
  try {
    response = await fetch("/api/correspondences", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.returnKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId: input.entryId,
        text: input.text,
        honeypot: input.honeypot,
        formRenderedAt: input.formRenderedAt,
      }),
    });
  } catch {
    return { type: "error", reason: "offline" };
  }

  if (response.status === 201) {
    const letter = readStartedLetter(await response.json().catch(() => null));
    return letter ? fromFirstLetterResult(letter) : FIRST_LETTER_FAILED;
  }
  // The entry, the phrase or the seal no longer allows this letter (404, 403, 401).
  if (response.status === 404 || response.status === 403 || response.status === 401) return { type: "unavailable" };
  if (response.status === 503) return { type: "letters_closed" };
  if (response.status === 429) return { type: "error", reason: "too_many" };
  return FIRST_LETTER_FAILED;
}

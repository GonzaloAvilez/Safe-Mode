import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

// Sends the phrase a person leaves in Leave a Trace (POST /api/phrases). Two steps send it, the
// writing form when letters are closed and the choice when they're open, so this is shared.
//
// With acceptsLetters the server also hands over the author's return key, once (ADR-004 #212).
// Nothing here stores it: the caller keeps it in memory for the card and nowhere else.

const SEAL_PATTERN = /^[0-9]{15}$/;

export type SendTraceInput = {
  text: string;
  acceptsLetters: boolean;
  honeypot: string;
  formRenderedAt: number;
  locale: string;
  // Shown when the server gives no reason of its own, or can't be reached.
  messages: { somethingWrong: string; couldntConnect: string };
};

export type SendTraceResult =
  | { type: "sent" }
  // Sent, and the person gets a seal. Only when they asked for letters and the server issued one.
  | { type: "sent_with_key"; returnKey: string; sentence: string }
  | { type: "error"; message: string };

export async function sendTrace(input: SendTraceInput): Promise<SendTraceResult> {
  try {
    const response = await fetch("/api/phrases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        honeypot: input.honeypot,
        formRenderedAt: input.formRenderedAt,
        origin: LEAVE_A_TRACE_ORIGIN,
        locale: input.locale,
        // Only sent when asked for: the plain form never mentions letters.
        ...(input.acceptsLetters ? { acceptsLetters: true } : {}),
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : input.messages.somethingWrong;
      return { type: "error", message };
    }

    // The phrase is saved either way. If letters closed meanwhile, the server saved it without
    // the choice and without a key, and the person simply finishes as anyone else does.
    if (
      input.acceptsLetters &&
      typeof body?.returnKey === "string" &&
      SEAL_PATTERN.test(body.returnKey) &&
      typeof body?.returnKeySentence === "string"
    ) {
      return { type: "sent_with_key", returnKey: body.returnKey, sentence: body.returnKeySentence };
    }
    return { type: "sent" };
  } catch {
    return { type: "error", message: input.messages.couldntConnect };
  }
}

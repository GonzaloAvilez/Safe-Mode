import "server-only";

// No human reads the prompt, types even a short phrase, and submits faster than this.
const MIN_SUBMIT_MS = 1500;

type BotCheckInput = {
  honeypot: unknown;
  formRenderedAt: unknown;
};

// Two independent signals, either one is enough: a filled honeypot means something
// filled in a field real visitors never see, and a too-fast submit means whatever
// sent this didn't actually wait for a person to read and type.
export function isSuspectedBot({ honeypot, formRenderedAt }: BotCheckInput): boolean {
  if (typeof honeypot === "string" && honeypot.length > 0) return true;
  if (typeof formRenderedAt !== "number") return true;

  return Date.now() - formRenderedAt < MIN_SUBMIT_MS;
}

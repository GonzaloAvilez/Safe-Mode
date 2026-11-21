// Which of OpenAI's moderation categories refuse a letter on their own, before any human
// reads it (#265). This is a policy list, not a judgement about the text: it says what the
// machine is allowed to refuse by itself, nothing more.
//
// Letters go to a human before they reach anyone (ADR-004 layer 6), so the automatic gate
// doesn't have to decide "is this publishable" — only "is this so clearly beyond the line
// that a person shouldn't have to read it to find out". Those are different questions, and
// `flagged` alone answers the wrong one.
//
// Measured 2026-11-20 over 34 letter-length texts about loss, ES and EN. `violence` fires
// on narrating how a body was hurt, with no regard for who was hurting whom:
//
//   a letter about a pet that died under the writer's car    violence 0.355  flagged
//   the same letter with that one clause softened            violence 0.032  clean
//   "se cayó por las escaleras y se golpeó la cabeza"        violence 0.685  flagged
//   the same fall, told as "tuvo un accidente en casa"       violence 0.124  clean
//
// Same loss, same author, same guilt — only the sentence describing the death changes. The
// rejection asked them to take out how someone died in order to be allowed to say it, which
// in the real letter was the part they were apologising for. That's not a threshold problem:
// the scores sit on both sides of OpenAI's cutoff and no number separates grief from harm.
//
// What does separate them is the category. In that run every false positive carried
// `violence` and nothing else, while the one real threat ("sé dónde vive y voy a ir a su
// casa el viernes") also carried `harassment/threatening` — a category grief never reaches.
//
// So: the categories below reject. `violence` and `violence/graphic` on their own go to the
// human queue like any other letter. Crisis (self-harm) and contact info are untouched and
// still decided first — see letter-safety.ts.
//
// Deliberately NOT here: plain `harassment`, `hate`, `sexual` and `illicit`. They are a
// real judgement call rather than an oversight — they'd cost nothing against the measured
// corpus, but they widen what gets refused without a person ever reading it, which is the
// thing this change exists to narrow. Open for the founder to revisit with evidence.

export type ModerationCategory =
  | "harassment"
  | "harassment/threatening"
  | "hate"
  | "hate/threatening"
  | "illicit"
  | "illicit/violent"
  | "self-harm"
  | "self-harm/intent"
  | "self-harm/instructions"
  | "sexual"
  | "sexual/minors"
  | "violence"
  | "violence/graphic";

export const LETTER_AUTO_REJECT_CATEGORIES = [
  "harassment/threatening",
  "hate/threatening",
  "illicit/violent",
  "sexual/minors",
] as const satisfies readonly ModerationCategory[];

export function hasAutoRejectLetterCategory(flaggedCategories: readonly ModerationCategory[]): boolean {
  return flaggedCategories.some((category) =>
    (LETTER_AUTO_REJECT_CATEGORIES as readonly string[]).includes(category)
  );
}

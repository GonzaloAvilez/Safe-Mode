import type { Locale } from "@/lib/locale";
import { RETURN_KEY_SENTENCES_EN } from "./en";
import { RETURN_KEY_SENTENCES_ES } from "./es";

// ADR-004 #212: the sentence on the return key card, next to the seal (decided 2026-11-16).
// The founder approves every sentence in the bank.
//
// It's a gift, not part of the key: the seal alone opens the mailbox. That's what lets it
// mean something. A sentence with meaning comes from few options, so it would be easy to
// guess; the seal's random digits carry all the security (identity-keys.ts).
//
// It's chosen at random and never depends on what the person wrote: Refugio never writes a
// response to their text (arrivalIntro.privacy), and entries are never linked to an
// identity (ADR-004 "Identity model").

export const RETURN_KEY_SENTENCES: Record<Locale, readonly string[]> = {
  es: RETURN_KEY_SENTENCES_ES,
  en: RETURN_KEY_SENTENCES_EN,
};

// Math.random is enough: the sentence protects nothing, and this way it works on the server
// and in the browser alike.
export function pickReturnKeySentence(locale: Locale): string {
  const sentences = RETURN_KEY_SENTENCES[locale];
  return sentences[Math.floor(Math.random() * sentences.length)];
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/locale";
import { RETURN_KEY_SENTENCES, pickReturnKeySentence } from "@/lib/return-key-sentences";

afterEach(() => {
  vi.restoreAllMocks();
});

// Fits on the card next to the seal.
const MAX_LENGTH = 80;

// A safety net for future edits, not the review itself: the founder reads every sentence.
// Words that could hurt someone in crisis, matched at the start of a word (so "muert" also
// catches "muerte" and "muerto").
const BLOCKED_STEMS: Record<(typeof SUPPORTED_LOCALES)[number], string[]> = {
  es: [
    "muert", "morir", "muere", "suicid", "sangr", "matar", "asesin", "herid", "cicatri", "tumba",
    "funer", "cadáver", "cuchill", "pistol", "dispar", "golpe", "dolor", "duel", "llor", "lágrim",
    "odio", "culpa", "crisis", "abus", "drog", "ansiedad", "depresi", "pánico", "vacío", "soledad",
    "miedo", "angusti", "sufr", "veneno", "ahog",
  ],
  // Whole words in English: stems like "pain" or "scar" would also catch "paint" or "scarf".
  en: [
    "die", "dies", "died", "dying", "death", "dead", "suicide", "suicidal", "blood", "bleed",
    "bleeding", "kill", "killed", "killing", "murder", "wound", "wounds", "wounded", "scar", "scars",
    "grave", "knife", "gun", "weapon", "pain", "painful", "hurt", "hurts", "grief", "grieve", "cry",
    "crying", "tears", "empty", "hate", "guilt", "crisis", "abuse", "drug", "drugs", "anxiety",
    "depression", "panic", "lonely", "loneliness", "fear", "afraid", "suffer", "suffering", "poison",
    "drown",
  ],
};

function blockedWordIn(sentence: string, locale: (typeof SUPPORTED_LOCALES)[number]): string | undefined {
  const words = sentence.toLowerCase().match(/\p{L}+(?:'\p{L}+)?/gu) ?? [];
  const blocked = BLOCKED_STEMS[locale];
  return locale === "es"
    ? words.find((word) => blocked.some((stem) => word.startsWith(stem)))
    : words.find((word) => blocked.includes(word));
}

describe.each(SUPPORTED_LOCALES)("the %s sentence bank", (locale) => {
  const sentences = RETURN_KEY_SENTENCES[locale];

  it("has enough sentences that two people rarely get the same one", () => {
    expect(sentences.length).toBeGreaterThanOrEqual(100);
  });

  it("has no sentence twice", () => {
    const normalized = sentences.map((sentence) => sentence.toLowerCase());
    expect(new Set(normalized).size).toBe(sentences.length);
  });

  it.each(sentences.map((sentence) => [sentence]))("%s: is one tidy sentence that fits the card", (sentence) => {
    expect(sentence).toBe(sentence.trim());
    expect(sentence).not.toMatch(/\s{2,}/);
    expect(sentence).toMatch(/^\p{Lu}/u);
    expect(sentence).toMatch(/[^.]\.$/);
    expect(sentence.length).toBeLessThanOrEqual(MAX_LENGTH);
  });

  it("contains nothing that could hurt someone in crisis", () => {
    const flagged = sentences
      .map((sentence) => ({ sentence, word: blockedWordIn(sentence, locale) }))
      .filter(({ word }) => word !== undefined);
    expect(flagged).toEqual([]);
  });
});

describe("the crisis safety net", () => {
  it.each([
    ["es", "La muerte también llega despacio.", "muerte"],
    ["es", "Hay días en que duele respirar.", "duele"],
    ["en", "Some days the pain is quieter.", "pain"],
    ["en", "Nobody has to feel lonely here.", "lonely"],
  ] as const)("catches a blocked word (%s: %s)", (locale, sentence, word) => {
    expect(blockedWordIn(sentence, locale)).toBe(word);
  });

  it.each([
    ["en", "A fresh coat of paint on the old door.", undefined],
    ["en", "A warm scarf on a cold morning.", undefined],
  ] as const)("doesn't flag a word that only starts like one (%s: %s)", (locale, sentence, expected) => {
    expect(blockedWordIn(sentence, locale)).toBe(expected);
  });
});

it("gives each locale the bank in its own language", () => {
  expect(RETURN_KEY_SENTENCES.es).toContain("Lo que sientes también tiene un lugar aquí.");
  expect(RETURN_KEY_SENTENCES.en).toContain("What you feel has a place here too.");
});

describe("pickReturnKeySentence", () => {
  it.each(SUPPORTED_LOCALES)("picks a sentence from the %s bank", (locale) => {
    expect(RETURN_KEY_SENTENCES[locale]).toContain(pickReturnKeySentence(locale));
  });

  it.each(SUPPORTED_LOCALES)("can reach the first and the last %s sentence", (locale) => {
    const sentences = RETURN_KEY_SENTENCES[locale];
    const random = vi.spyOn(Math, "random");

    random.mockReturnValue(0);
    expect(pickReturnKeySentence(locale)).toBe(sentences[0]);

    random.mockReturnValue(0.999999999);
    expect(pickReturnKeySentence(locale)).toBe(sentences[sentences.length - 1]);
  });
});

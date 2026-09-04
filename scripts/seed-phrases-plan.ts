export type SeedLocale = "en" | "es";

export type SeedPhrase = {
  text: string;
  category: string;
  language: SeedLocale;
};

export type SeedOptions = {
  locale: SeedLocale;
  write: boolean;
};

export function parseSeedOptions(args: string[]): SeedOptions {
  let locale: SeedLocale | null = null;
  let write = false;

  for (const arg of args) {
    if (arg === "--write") {
      write = true;
      continue;
    }

    if (arg.startsWith("--locale=")) {
      const value = arg.slice("--locale=".length);
      if (value !== "en" && value !== "es") {
        throw new Error(`Unsupported locale "${value}". Expected en or es.`);
      }
      locale = value;
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  if (!locale) {
    throw new Error("Missing required --locale=en|es argument.");
  }

  return { locale, write };
}

export function planSeedPhrases(corpus: SeedPhrase[], existingTexts: Iterable<string>) {
  const seen = new Set<string>();
  for (const phrase of corpus) {
    if (seen.has(phrase.text)) {
      throw new Error(`Duplicate ${phrase.language} source phrase: ${phrase.text}`);
    }
    seen.add(phrase.text);
  }

  const existing = new Set(existingTexts);
  return {
    existing: corpus.filter((phrase) => existing.has(phrase.text)),
    missing: corpus.filter((phrase) => !existing.has(phrase.text)),
  };
}


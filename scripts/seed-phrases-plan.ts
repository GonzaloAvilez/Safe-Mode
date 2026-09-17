export type SeedLocale = "en" | "es";

export type SeedPhrase = {
  text: string;
  category: string;
  language: SeedLocale;
};

export type SeedOptions = {
  locale: SeedLocale;
  write: boolean;
  spreadDays?: number;
};

export function parseSeedOptions(args: string[]): SeedOptions {
  let locale: SeedLocale | null = null;
  let write = false;
  let spreadDays: number | undefined;

  for (const arg of args) {
    if (arg.startsWith("--spread-days=")) {
      const value = arg.slice("--spread-days=".length);
      spreadDays = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(spreadDays) || spreadDays < 1 || spreadDays > 365) {
        throw new Error("--spread-days must be an integer between 1 and 365.");
      }
      continue;
    }
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

  return { locale, write, ...(spreadDays === undefined ? {} : { spreadDays }) };
}

// Curated seed dates are synthetic display dates, not user submission timestamps.
// Use the full corpus index so skipping existing rows does not compress the range.
export function seedCreatedAt(index: number, count: number, days: number, now: Date): string {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count ||
      !Number.isInteger(days) || days < 1 || days > 365 || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid seed date range or corpus position.");
  }
  const ageMs = ((count - index) / count) * days * 86_400_000;
  return new Date(now.getTime() - ageMs).toISOString();
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

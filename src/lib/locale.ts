export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

// Locale stays optional during migration so the deployed English client remains
// compatible. Explicit unsupported values are rejected instead of crossing corpora.
export function resolveLocale(value: unknown): Locale | null {
  if (value === undefined || value === null) return DEFAULT_LOCALE;
  return isLocale(value) ? value : null;
}

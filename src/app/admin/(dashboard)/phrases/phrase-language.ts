import { isLocale } from "@/lib/locale";

export function phraseLanguage(language: unknown): { code: string; label: string } {
  if (typeof language !== "string" || !language.trim()) {
    return { code: "Sin idioma", label: "Sin idioma" };
  }
  if (!isLocale(language)) {
    return { code: language.toUpperCase(), label: `${language} (no compatible)` };
  }
  const name = new Intl.DisplayNames([language], { type: "language" }).of(language) ?? language;
  return {
    code: language.toUpperCase(),
    label: name.charAt(0).toLocaleUpperCase(language) + name.slice(1),
  };
}

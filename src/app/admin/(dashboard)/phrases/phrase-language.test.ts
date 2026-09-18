import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/locale";
import { phraseLanguage } from "./phrase-language";

describe("phraseLanguage", () => {
  it.each([null, undefined, "", " ", "\t", 42, false, {}, []])(
    "renders a missing or malformed language safely: %j",
    (language) => {
      expect(phraseLanguage(language)).toEqual({ code: "Sin idioma", label: "Sin idioma" });
    }
  );

  it.each(SUPPORTED_LOCALES)("labels supported language %s without a separate language list", (language) => {
    const result = phraseLanguage(language);
    expect(result.code).toBe(language.toUpperCase());
    expect(result.label.length).toBeGreaterThan(0);
    expect(result.label).not.toContain("no compatible");
  });

  it.each(["fr", "invalid_locale", "ES", " es "])(
    "shows unsupported values without misclassifying them or passing them to Intl: %s",
    (language) => {
      expect(phraseLanguage(language)).toEqual({
        code: language.toUpperCase(), label: `${language} (no compatible)`,
      });
    }
  );
});

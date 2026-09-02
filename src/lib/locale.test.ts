import { describe, expect, it } from "vitest";
import { resolveLocale } from "@/lib/locale";

describe("resolveLocale", () => {
  it.each(["en", "es"])("accepts supported locale %s", (locale) => {
    expect(resolveLocale(locale)).toBe(locale);
  });

  it.each([undefined, null])("defaults a missing locale to English", (locale) => {
    expect(resolveLocale(locale)).toBe("en");
  });

  it.each(["fr", "", 1, true])("rejects unsupported locale %j", (locale) => {
    expect(resolveLocale(locale)).toBeNull();
  });
});

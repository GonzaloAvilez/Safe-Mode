import { describe, expect, it } from "vitest";
import { canSwitchLocale, replaceLocaleInPathname } from "./language-selector";

describe("replaceLocaleInPathname", () => {
  it.each([
    ["/en", "es", "/es"],
    ["/en/observe", "es", "/es/observe"],
    ["/es/leave-a-trace", "en", "/en/leave-a-trace"],
  ] as const)("changes only the locale segment in %s", (pathname, locale, expected) => {
    expect(replaceLocaleInPathname(pathname, locale)).toBe(expected);
  });
});

describe("canSwitchLocale", () => {
  it("rejects a locale change immediately while a critical transition is locked", () => {
    expect(canSwitchLocale("es", "en", true)).toBe(false);
  });

  it("allows a different locale after the destination unlocks the transition", () => {
    expect(canSwitchLocale("es", "en", false)).toBe(true);
  });

  it("does not navigate when the selected locale is already active", () => {
    expect(canSwitchLocale("es", "es", false)).toBe(false);
  });
});

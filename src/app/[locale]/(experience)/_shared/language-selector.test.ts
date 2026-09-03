import { describe, expect, it } from "vitest";
import { replaceLocaleInPathname } from "./language-selector";

describe("replaceLocaleInPathname", () => {
  it.each([
    ["/en", "es", "/es"],
    ["/en/observe", "es", "/es/observe"],
    ["/es/leave-a-trace", "en", "/en/leave-a-trace"],
  ] as const)("changes only the locale segment in %s", (pathname, locale, expected) => {
    expect(replaceLocaleInPathname(pathname, locale)).toBe(expected);
  });
});

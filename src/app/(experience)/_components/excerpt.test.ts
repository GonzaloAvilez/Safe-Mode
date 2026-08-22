import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("returns short text unchanged", () => {
    expect(excerpt("I forgot how quiet")).toBe("I forgot how quiet");
  });

  it("returns text unchanged at exactly the word limit", () => {
    expect(excerpt("one two three four five six", 6)).toBe("one two three four five six");
  });

  it("truncates with an ellipsis past the word limit", () => {
    expect(excerpt("one two three four five six seven", 6)).toBe("one two three four five six…");
  });

  it("collapses repeated whitespace when splitting words", () => {
    expect(excerpt("  one   two    three  ")).toBe("one two three");
  });

  it("respects a custom maxWords value", () => {
    expect(excerpt("one two three four", 2)).toBe("one two…");
  });
});

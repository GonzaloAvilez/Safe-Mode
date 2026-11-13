import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it.each([
    ["a lowercase uuid", "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70"],
    ["an uppercase uuid", "6F1C2C8E-8A7B-4C1E-9D5A-2B3C4D5E6F70"],
  ])("accepts %s", (_label, value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    ["a short id", "entry-1"],
    ["a uuid without dashes", "6f1c2c8e8a7b4c1e9d5a2b3c4d5e6f70"],
    ["a uuid with surrounding text", "x6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70"],
    ["a uuid with a non-hex character", "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f7g"],
    ["an empty string", ""],
    // regex.test() would stringify it into a bare uuid; a JSON body can send exactly this.
    ["an array holding a uuid", ["6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70"]],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseSeal } from "@/lib/parse-seal";

const SEAL = "482133901756229";

describe("parseSeal", () => {
  it.each([
    ["482133901756229", "plain digits"],
    ["48213 39017 56229", "spaces between groups"],
    ["48213 · 39017 · 56229", "the middle dots the card prints"],
    ["48213-39017-56229", "hyphens"],
    ["48213.39017.56229", "dots"],
    ["  482133901756229\n", "whitespace around it"],
  ])("reads %j (%s) as the seal", (input) => {
    expect(parseSeal(input)).toBe(SEAL);
  });

  it("keeps leading zeros", () => {
    expect(parseSeal("00012 00003 00004")).toBe("000120000300004");
  });

  it.each(["", "48213", "48213 39017 5622", "48213 39017 562290", "48213 39017 5622a", "48213/39017/56229", "https://refugio/482133901756229"])(
    "returns null for %j, which is not a whole seal",
    (input) => {
      expect(parseSeal(input)).toBeNull();
    }
  );
});

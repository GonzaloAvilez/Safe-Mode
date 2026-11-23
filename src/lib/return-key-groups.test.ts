import { describe, expect, it } from "vitest";
import {
  formatReturnKey,
  parseSeal,
  splitReturnKeyGroups,
} from "@/lib/return-key-groups";

const SEAL = "482133901756229";

describe("splitReturnKeyGroups", () => {
  it("splits the seal into its three groups of five digits", () => {
    expect(splitReturnKeyGroups(SEAL)).toEqual(["48213", "39017", "56229"]);
  });

  it("keeps leading zeros", () => {
    expect(splitReturnKeyGroups("000120000300004")).toEqual(["00012", "00003", "00004"]);
  });

  it.each(["", "48213", "48213390175622", "4821339017562290", "48213 39017 56229", "48213390175622a"])(
    "throws for %j, which is not a 15-digit seal",
    (input) => {
      expect(() => splitReturnKeyGroups(input)).toThrow("not a 15-digit seal");
    }
  );
});

describe("formatReturnKey", () => {
  it("prints the groups with the middle dots the card shows", () => {
    expect(formatReturnKey(SEAL)).toBe("48213 · 39017 · 56229");
  });

  it("accepts another separator", () => {
    expect(formatReturnKey(SEAL, "-")).toBe("48213-39017-56229");
  });
});

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

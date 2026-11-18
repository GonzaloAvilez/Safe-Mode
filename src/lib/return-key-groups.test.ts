import { describe, expect, it } from "vitest";
import {
  formatReturnKey,
  isAskedGroupCorrect,
  pickAskedGroup,
  splitReturnKeyGroups,
  type SealGroupIndex,
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

describe("pickAskedGroup", () => {
  it("reaches every group when nothing was asked before", () => {
    const seen = new Set<SealGroupIndex>();
    for (const random of [0, 0.34, 0.67, 0.999]) seen.add(pickAskedGroup(null, () => random));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });

  it.each([0, 1, 2] as const)("never repeats group %s when it was just asked", (previous) => {
    const seen = new Set<SealGroupIndex>();
    for (const random of [0, 0.25, 0.5, 0.75, 0.999999]) seen.add(pickAskedGroup(previous, () => random));

    expect(seen.has(previous)).toBe(false);
    expect(seen.size).toBe(2);
  });

  it("stays inside the groups even if the random source returns exactly 1", () => {
    expect([0, 1, 2]).toContain(pickAskedGroup(null, () => 1));
    expect([0, 1, 2]).toContain(pickAskedGroup(0, () => 1));
  });

  it("is uniform enough with the real random source", () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i += 1) counts[pickAskedGroup()] += 1;

    for (const count of counts) expect(count).toBeGreaterThan(800);
  });
});

describe("isAskedGroupCorrect", () => {
  it.each([
    [0, "48213", true],
    [1, "39017", true],
    [2, "56229", true],
    [1, "39 017", true], // spaces, dots and the like don't matter
    [1, "39.017", true],
    [0, "39017", false], // another group of the same seal
    [1, "3901", false], // not five digits
    [1, "390177", false],
    [1, "", false],
    [1, "abcde", false],
  ])("group %s typed as %j → %s", (asked, typed, expected) => {
    expect(isAskedGroupCorrect(SEAL, asked as SealGroupIndex, typed)).toBe(expected);
  });

  it("keeps leading zeros: 00012 is not 12", () => {
    expect(isAskedGroupCorrect("000120000300004", 0, "00012")).toBe(true);
    expect(isAskedGroupCorrect("000120000300004", 0, "12")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { resolveEntryRoute } from "@/lib/safety/entry-routing";

// Entry routing never reads this one — it's the letters' signal (#265) — so it stays false
// here and the cases below keep saying what they always said.
const NO_AGGRESSION = { flaggedDirectedAggression: false };

describe("resolveEntryRoute", () => {
  it("returns 'proceed' when nothing is flagged and the daily cap allows it", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: false, ...NO_AGGRESSION }, true);

    expect(route).toBe("proceed");
  });

  it("returns 'crisis' when flaggedCrisis is true, regardless of the cap", () => {
    const route = resolveEntryRoute({ flaggedCrisis: true, flaggedGeneral: false, ...NO_AGGRESSION }, true);

    expect(route).toBe("crisis");
  });

  it("returns 'crisis' even when the cap has already been reached", () => {
    const route = resolveEntryRoute({ flaggedCrisis: true, flaggedGeneral: false, ...NO_AGGRESSION }, false);

    expect(route).toBe("crisis");
  });

  it("returns 'cap_reached' when it isn't crisis but the daily cap blocks it", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: false, ...NO_AGGRESSION }, false);

    expect(route).toBe("cap_reached");
  });

  // #261: a general moderation flag never stops an entry, whatever else is true.
  it.each([
    { flaggedCrisis: false, flaggedGeneral: true, withinDailyCap: true, expected: "proceed" },
    { flaggedCrisis: false, flaggedGeneral: true, withinDailyCap: false, expected: "cap_reached" },
    { flaggedCrisis: true, flaggedGeneral: true, withinDailyCap: true, expected: "crisis" },
  ] as const)(
    "routes a general-flagged entry like any other (crisis=$flaggedCrisis, cap ok=$withinDailyCap → $expected)",
    ({ flaggedCrisis, flaggedGeneral, withinDailyCap, expected }) => {
      expect(resolveEntryRoute({ flaggedCrisis, flaggedGeneral, ...NO_AGGRESSION }, withinDailyCap)).toBe(expected);
    }
  );
});

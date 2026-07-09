import { describe, expect, it } from "vitest";
import { resolveEntryRoute } from "@/lib/safety/entry-routing";

describe("resolveEntryRoute", () => {
  it("returns 'proceed' when nothing is flagged and the daily cap allows it", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: false }, true);

    expect(route).toBe("proceed");
  });

  it("returns 'crisis' when flaggedCrisis is true, regardless of the cap", () => {
    const route = resolveEntryRoute({ flaggedCrisis: true, flaggedGeneral: false }, true);

    expect(route).toBe("crisis");
  });

  it("returns 'crisis' even when the cap has already been reached", () => {
    const route = resolveEntryRoute({ flaggedCrisis: true, flaggedGeneral: false }, false);

    expect(route).toBe("crisis");
  });

  it("returns 'general_flagged' when only flaggedGeneral is true", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: true }, true);

    expect(route).toBe("general_flagged");
  });

  it("prioritizes 'crisis' over 'general_flagged' when both are somehow true", () => {
    const route = resolveEntryRoute({ flaggedCrisis: true, flaggedGeneral: true }, true);

    expect(route).toBe("crisis");
  });

  it("returns 'cap_reached' when nothing is flagged but the daily cap blocks it", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: false }, false);

    expect(route).toBe("cap_reached");
  });

  it("checks moderation before the cap: general_flagged wins even when the cap is also reached", () => {
    const route = resolveEntryRoute({ flaggedCrisis: false, flaggedGeneral: true }, false);

    expect(route).toBe("general_flagged");
  });
});

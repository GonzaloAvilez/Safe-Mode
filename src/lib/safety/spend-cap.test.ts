import { describe, expect, it } from "vitest";
import { DAILY_SPEND_CAP_USD, canSpend } from "@/lib/safety/spend-cap";

describe("canSpend", () => {
  it("allows a call that keeps total spend well under the cap", () => {
    expect(canSpend(1.0, 0.5)).toBe(true);
  });

  it("allows a call that lands exactly on the cap (hard cap, not exceeded)", () => {
    expect(canSpend(4.5, 0.5)).toBe(true);
    expect(DAILY_SPEND_CAP_USD).toBe(5);
  });

  it("blocks a call that would push total spend over the cap", () => {
    expect(canSpend(4.5, 0.51)).toBe(false);
  });

  it("blocks any call once spend already meets or exceeds the cap", () => {
    expect(canSpend(5, 0.01)).toBe(false);
    expect(canSpend(6, 0.01)).toBe(false);
  });

  it("respects a custom cap override", () => {
    expect(canSpend(0.8, 0.1, 1)).toBe(true);
    expect(canSpend(0.95, 0.1, 1)).toBe(false);
  });
});

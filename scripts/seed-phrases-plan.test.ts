import { describe, expect, it } from "vitest";
import { parseSeedOptions, planSeedPhrases, seedCreatedAt, type SeedPhrase } from "./seed-phrases-plan";

const phrases: SeedPhrase[] = [
  { category: "loneliness", text: "Primera frase", language: "es" },
  { category: "relief", text: "Segunda frase", language: "es" },
];

describe("parseSeedOptions", () => {
  it("accepts a bounded date spread without enabling writes", () => {
    expect(parseSeedOptions(["--locale=es", "--spread-days=30"])).toEqual({ locale: "es", write: false, spreadDays: 30 });
    for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "366"]) {
      expect(() => parseSeedOptions(["--locale=es", `--spread-days=${value}`])).toThrow("--spread-days");
    }
  });
  it("defaults to a read-only dry run for an explicit locale", () => {
    expect(parseSeedOptions(["--locale=es"])).toEqual({ locale: "es", write: false });
  });

  it("requires both an explicit locale and an explicit write flag before mutation", () => {
    expect(parseSeedOptions(["--locale=es", "--write"])).toEqual({ locale: "es", write: true });
    expect(() => parseSeedOptions([])).toThrow("Missing required --locale=en|es");
  });

  it("rejects unsupported locales and unknown arguments", () => {
    expect(() => parseSeedOptions(["--locale=fr"])).toThrow('Unsupported locale "fr"');
    expect(() => parseSeedOptions(["--locale=es", "--force"])).toThrow('Unknown argument "--force"');
  });
});

describe("seedCreatedAt", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  it("gives all 50 seed phrases distinct past dates within 30 days", () => {
    const dates = Array.from({ length: 50 }, (_, index) => seedCreatedAt(index, 50, 30, now));
    expect(new Set(dates).size).toBe(50);
    expect(dates[0]).toBe("2026-08-18T12:00:00.000Z");
    for (const date of dates) {
      expect(Date.parse(date)).toBeLessThan(now.getTime());
      expect(Date.parse(date)).toBeGreaterThanOrEqual(now.getTime() - 30 * 86_400_000);
    }
  });
  it("supports a single phrase and rejects invalid positions", () => {
    expect(seedCreatedAt(0, 1, 30, now)).toBe("2026-08-18T12:00:00.000Z");
    expect(() => seedCreatedAt(0, 0, 30, now)).toThrow();
    expect(() => seedCreatedAt(50, 50, 30, now)).toThrow();
  });
});

describe("planSeedPhrases", () => {
  it("skips existing phrases before any embedding or insert work", () => {
    const plan = planSeedPhrases(phrases, ["Primera frase"]);

    expect(plan.existing.map(({ text }) => text)).toEqual(["Primera frase"]);
    expect(plan.missing.map(({ text }) => text)).toEqual(["Segunda frase"]);
  });

  it("makes a completed sequential seed run idempotent", () => {
    const plan = planSeedPhrases(phrases, phrases.map(({ text }) => text));

    expect(plan.existing).toHaveLength(2);
    expect(plan.missing).toHaveLength(0);
  });

  it("rejects duplicate phrases in the source corpus", () => {
    expect(() => planSeedPhrases([...phrases, phrases[0]], [])).toThrow("Duplicate es source phrase");
  });
});

import { describe, expect, it } from "vitest";
import { parseSeedOptions, planSeedPhrases, type SeedPhrase } from "./seed-phrases-plan";

const phrases: SeedPhrase[] = [
  { category: "loneliness", text: "Primera frase", language: "es" },
  { category: "relief", text: "Segunda frase", language: "es" },
];

describe("parseSeedOptions", () => {
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


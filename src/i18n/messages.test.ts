import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

function catalogShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(catalogShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, catalogShape(child)])
    );
  }
  return typeof value;
}

describe("message catalogs", () => {
  it("keeps English and Spanish structurally identical", () => {
    expect(catalogShape(es)).toEqual(catalogShape(en));
  });

  it("ships localized metadata and cold-arrival copy", () => {
    expect(es.metadata.description).not.toBe(en.metadata.description);
    expect(es.arrivalIntro.welcomeHeadline).not.toBe(en.arrivalIntro.welcomeHeadline);
  });
});

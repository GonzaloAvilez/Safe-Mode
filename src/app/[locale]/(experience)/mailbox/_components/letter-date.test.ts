import { describe, expect, it } from "vitest";
import { formatLetterAge } from "./letter-date";

const NOW = new Date("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatLetterAge", () => {
  it.each([
    [0, "es", "ahora"],
    [59_000, "es", "ahora"],
    [MINUTE, "es", "hace 1 minuto"],
    [5 * MINUTE, "es", "hace 5 minutos"],
    [59 * MINUTE, "es", "hace 59 minutos"],
    [HOUR, "es", "hace 1 hora"],
    [23 * HOUR, "es", "hace 23 horas"],
    [DAY, "es", "ayer"],
    [2 * DAY, "es", "anteayer"],
    [3 * DAY, "es", "hace 3 días"],
    [29 * DAY, "es", "hace 29 días"],
    [30 * DAY, "es", "el mes pasado"],
    [62 * DAY, "es", "hace 2 meses"],
    [2 * DAY, "en", "2 days ago"],
    [DAY, "en", "yesterday"],
  ])("%i ms ago in %s reads %j", (elapsed, locale, expected) => {
    expect(formatLetterAge(ago(elapsed), NOW, locale)).toBe(expected);
  });

  it("never says a letter comes from the future, even if the clocks disagree", () => {
    expect(formatLetterAge(new Date(NOW.getTime() + 10 * MINUTE).toISOString(), NOW, "es")).toBe("ahora");
  });
});

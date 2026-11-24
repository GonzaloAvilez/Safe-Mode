import { describe, expect, it } from "vitest";
import { noticeFor } from "@/lib/notifications/messages";

describe("noticeFor", () => {
  it.each([
    ["es", { title: "Refugio", body: "Alguien te escribió una carta." }],
    ["en", { title: "Refugio", body: "Someone wrote you a letter." }],
  ] as const)("letter_delivered in %s is the catalog's fixed line, nothing else", (locale, expected) => {
    expect(noticeFor("letter_delivered", locale)).toEqual(expected);
  });
});

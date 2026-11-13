import { describe, expect, it } from "vitest";
import { readJsonObject } from "@/lib/request-body";

function requestWithBody(raw: string): Request {
  return new Request("http://localhost/api/correspondences", { method: "POST", body: raw });
}

describe("readJsonObject", () => {
  it.each([
    ["an object", '{"text":"hola","formRenderedAt":0}', { text: "hola", formRenderedAt: 0 }],
    ["an empty object", "{}", {}],
  ])("returns %s as parsed", async (_label, raw, expected) => {
    expect(await readJsonObject(requestWithBody(raw))).toEqual(expected);
  });

  it.each([
    ["malformed JSON", "{"],
    ["an empty body", ""],
    ["null", "null"],
    ["an array", '[{"text":"hola"}]'],
    ["a string", '"hola"'],
    ["a number", "5"],
    ["a boolean", "true"],
  ])("returns null for %s", async (_label, raw) => {
    expect(await readJsonObject(requestWithBody(raw))).toBeNull();
  });
});

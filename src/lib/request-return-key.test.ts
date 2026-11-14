import { describe, expect, it } from "vitest";
import { getRequestReturnKey } from "@/lib/request-return-key";

const KEY = "Zx9_k2Lm-Qw8Rt5Yu1Io3Pa7Sd4Fg6Hj0Kl2Zx9Cv5B";

function requestWithAuthorization(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("authorization", value);
  return new Request("http://localhost/api/mailbox", { headers });
}

describe("getRequestReturnKey", () => {
  it.each([
    ["Bearer <key>", `Bearer ${KEY}`],
    ["a lowercase scheme (schemes are case-insensitive)", `bearer ${KEY}`],
    ["several spaces after the scheme", `Bearer   ${KEY}`],
  ])("reads the key from %s", (_label, header) => {
    expect(getRequestReturnKey(requestWithAuthorization(header))).toBe(KEY);
  });

  it.each([
    ["no Authorization header", null],
    ["another scheme", `Basic ${KEY}`],
    ["the scheme without a key", "Bearer"],
    ["the key without the scheme", KEY],
    ["the scheme preceded by something else", `Token Bearer ${KEY}`],
    ["two tokens after the scheme", `Bearer ${KEY} extra`],
  ])("returns null for %s", (_label, header) => {
    expect(getRequestReturnKey(requestWithAuthorization(header))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { getRequestReturnKey } from "@/lib/request-return-key";

const KEY = "482133901756229";

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

  // A seal may arrive with spaces between its groups. Everything after the scheme is
  // passed on as is; resolveIdentityFromReturnKey decides whether it's a key.
  it("reads a key with spaces inside it", () => {
    expect(getRequestReturnKey(requestWithAuthorization("Bearer 48213 39017 56229"))).toBe("48213 39017 56229");
  });

  it.each([
    ["no Authorization header", null],
    ["another scheme", `Basic ${KEY}`],
    ["the scheme without a key", "Bearer"],
    ["the scheme followed only by spaces", "Bearer    "],
    ["the key without the scheme", KEY],
    ["the scheme preceded by something else", `Token Bearer ${KEY}`],
  ])("returns null for %s", (_label, header) => {
    expect(getRequestReturnKey(requestWithAuthorization(header))).toBeNull();
  });
});

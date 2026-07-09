import { describe, expect, it } from "vitest";
import { getRequestIp } from "@/lib/request-ip";

function requestWithForwardedFor(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("x-forwarded-for", value);
  return new Request("http://localhost/api/entries", { headers });
}

describe("getRequestIp", () => {
  it("returns the IP from x-forwarded-for when present", () => {
    const ip = getRequestIp(requestWithForwardedFor("203.0.113.10"));

    expect(ip).toBe("203.0.113.10");
  });

  it("returns only the first IP when x-forwarded-for has a proxy chain", () => {
    const ip = getRequestIp(requestWithForwardedFor("203.0.113.10, 10.0.0.1, 10.0.0.2"));

    expect(ip).toBe("203.0.113.10");
  });

  it("trims whitespace around the first IP", () => {
    const ip = getRequestIp(requestWithForwardedFor("  203.0.113.10  , 10.0.0.1"));

    expect(ip).toBe("203.0.113.10");
  });

  it("returns 'unknown' when x-forwarded-for is missing", () => {
    const ip = getRequestIp(requestWithForwardedFor(null));

    expect(ip).toBe("unknown");
  });
});

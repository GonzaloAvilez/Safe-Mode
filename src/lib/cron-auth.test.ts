import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

function request(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/anything", { headers });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("isAuthorizedCronRequest", () => {
  it("lets in exactly the configured secret, as a Bearer token", () => {
    process.env.CRON_SECRET = "test-secret";

    expect(isAuthorizedCronRequest(request("Bearer test-secret"))).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer wrong-secret"],
    ["the secret without its scheme", "test-secret"],
    ["the secret with more after it", "Bearer test-secret2"],
    ["another scheme", "Basic test-secret"],
  ])("refuses %s", (_label, authorization) => {
    process.env.CRON_SECRET = "test-secret";

    expect(isAuthorizedCronRequest(request(authorization))).toBe(false);
  });

  it.each([
    ["isn't set", undefined],
    ["is empty", ""],
  ])("refuses everything when the secret %s, even “Bearer undefined”", (_label, secret) => {
    if (secret !== undefined) process.env.CRON_SECRET = secret;

    expect(isAuthorizedCronRequest(request("Bearer undefined"))).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer "))).toBe(false);
    expect(isAuthorizedCronRequest(request())).toBe(false);
  });
});

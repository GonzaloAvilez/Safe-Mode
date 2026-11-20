import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteAbandonedIdentitiesMock } = vi.hoisted(() => ({ deleteAbandonedIdentitiesMock: vi.fn() }));

vi.mock("@/lib/abandoned-identities", () => ({ deleteAbandonedIdentities: deleteAbandonedIdentitiesMock }));

const { GET } = await import("@/app/api/cron/delete-abandoned-identities/route");

function cronRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/delete-abandoned-identities", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  vi.resetAllMocks();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/delete-abandoned-identities", () => {
  it.each([
    ["missing", undefined],
    ["wrong", "Bearer wrong-secret"],
    ["sent without its scheme", "test-secret"],
  ])("returns 401 and deletes nothing when the secret is %s", async (_label, authHeader) => {
    const response = await GET(cronRequest(authHeader));

    expect(response.status).toBe(401);
    expect(deleteAbandonedIdentitiesMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no secret is configured, even for a request that sends none", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(cronRequest("Bearer undefined"));

    expect(response.status).toBe(401);
    expect(deleteAbandonedIdentitiesMock).not.toHaveBeenCalled();
  });

  it("deletes and returns only how many, when the secret matches", async () => {
    deleteAbandonedIdentitiesMock.mockResolvedValueOnce(3);

    const response = await GET(cronRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedIdentityCount: 3 });
  });

  it("fails loudly when the cleanup fails, so the run shows as failed", async () => {
    deleteAbandonedIdentitiesMock.mockRejectedValueOnce(new Error("connection failure"));

    await expect(GET(cronRequest("Bearer test-secret"))).rejects.toThrow("connection failure");
  });
});

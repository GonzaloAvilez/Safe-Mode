import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { anonymizeExpiredLettersMock, closeInactiveCorrespondencesMock } = vi.hoisted(() => ({
  anonymizeExpiredLettersMock: vi.fn(),
  closeInactiveCorrespondencesMock: vi.fn(),
}));

vi.mock("@/lib/letter-retention", () => ({
  anonymizeExpiredLetters: anonymizeExpiredLettersMock,
  closeInactiveCorrespondences: closeInactiveCorrespondencesMock,
}));

const { GET } = await import("@/app/api/cron/apply-letter-retention/route");

function cronRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/apply-letter-retention", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  vi.resetAllMocks();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/apply-letter-retention", () => {
  it.each([
    ["missing", undefined],
    ["wrong", "Bearer wrong-secret"],
  ])("returns 401 and runs nothing when the secret is %s", async (_label, authHeader) => {
    const response = await GET(cronRequest(authHeader));

    expect(response.status).toBe(401);
    expect(anonymizeExpiredLettersMock).not.toHaveBeenCalled();
    expect(closeInactiveCorrespondencesMock).not.toHaveBeenCalled();
  });

  it("runs both jobs and returns only counts when the secret matches", async () => {
    anonymizeExpiredLettersMock.mockResolvedValueOnce(4);
    closeInactiveCorrespondencesMock.mockResolvedValueOnce(2);

    const response = await GET(cronRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ anonymizedLetterCount: 4, closedCorrespondenceCount: 2 });
  });

  it("propagates a failure so the cron run shows as failed", async () => {
    anonymizeExpiredLettersMock.mockRejectedValueOnce(new Error("connection failure"));

    await expect(GET(cronRequest("Bearer test-secret"))).rejects.toThrow("connection failure");
  });
});

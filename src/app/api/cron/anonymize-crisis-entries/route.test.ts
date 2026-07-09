import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { anonymizeExpiredCrisisEntriesMock } = vi.hoisted(() => ({
  anonymizeExpiredCrisisEntriesMock: vi.fn(),
}));

vi.mock("@/lib/crisis-entries", () => ({
  anonymizeExpiredCrisisEntries: anonymizeExpiredCrisisEntriesMock,
}));

const { GET } = await import("@/app/api/cron/anonymize-crisis-entries/route");

function cronRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/anonymize-crisis-entries", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/anonymize-crisis-entries", () => {
  it("returns 401 and never runs the job when the secret is missing", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(anonymizeExpiredCrisisEntriesMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret doesn't match", async () => {
    const response = await GET(cronRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(anonymizeExpiredCrisisEntriesMock).not.toHaveBeenCalled();
  });

  it("runs the job and returns 200 with the count when the secret matches", async () => {
    anonymizeExpiredCrisisEntriesMock.mockResolvedValueOnce(3);

    const response = await GET(cronRequest("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ anonymizedCount: 3 });
  });
});

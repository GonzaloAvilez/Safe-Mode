import { afterEach, describe, expect, it, vi } from "vitest";

const { selectKeyMock, singleMock, upsertMock } = vi.hoisted(() => ({
  selectKeyMock: vi.fn(),
  singleMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          selectKeyMock(column, value);
          return { single: singleMock };
        },
      }),
      upsert: upsertMock,
    }),
  },
}));

// Flags are cached at module scope and keyed by VERCEL_ENV, read once at load time, so
// every test loads a fresh copy of the module for a known environment.
async function loadSettings() {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.resetModules();
  return import("@/lib/settings");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("isLettersOpen", () => {
  it.each([
    ["the environment has no row yet", { data: null, error: { code: "PGRST116" } }],
    ["the read fails", { data: null, error: new Error("network down") }],
  ])("fails closed when %s", async (_label, result) => {
    singleMock.mockResolvedValueOnce(result);
    const { isLettersOpen } = await loadSettings();

    await expect(isLettersOpen()).resolves.toBe(false);
  });

  it("reads this environment's own row", async () => {
    singleMock.mockResolvedValueOnce({ data: { value: true }, error: null });
    const { isLettersOpen } = await loadSettings();

    await expect(isLettersOpen()).resolves.toBe(true);
    expect(selectKeyMock).toHaveBeenCalledWith("key", "letters_open:preview");
  });
});

describe("setLettersOpen", () => {
  it("writes this environment's row, and the next read sees it without waiting for the cache", async () => {
    upsertMock.mockResolvedValueOnce({ error: null });
    singleMock.mockResolvedValueOnce({ data: { value: false }, error: null });
    const { isLettersOpen, setLettersOpen } = await loadSettings();
    await expect(isLettersOpen()).resolves.toBe(false);

    await setLettersOpen(true);
    singleMock.mockResolvedValueOnce({ data: { value: true }, error: null });

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ key: "letters_open:preview", value: true }));
    await expect(isLettersOpen()).resolves.toBe(true);
  });
});

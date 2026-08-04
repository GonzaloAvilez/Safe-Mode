import { describe, expect, it } from "vitest";
import { unwrap } from "@/lib/supabase-result";

describe("unwrap", () => {
  it("returns data when there's no error", () => {
    expect(unwrap({ id: "1" }, null)).toEqual({ id: "1" });
  });

  it("returns falsy-but-valid data (0, empty array) unchanged when there's no error", () => {
    expect(unwrap(0, null)).toBe(0);
    expect(unwrap([], null)).toEqual([]);
  });

  it("throws the exact original error object when present, ignoring data", () => {
    const error = { name: "PostgrestError", message: "boom", details: "", hint: "", code: "500" };

    let thrown: unknown;
    try {
      unwrap(null, error as never);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBe(error);
  });
});

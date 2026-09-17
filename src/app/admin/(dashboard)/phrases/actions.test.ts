import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, remove, revalidate } = vi.hoisted(() => ({
  auth: vi.fn(), remove: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/admin-session", () => ({ requireAdminSession: auth }));
vi.mock("@/lib/phrases", () => ({ deletePhrase: remove }));
vi.mock("@/lib/phrase-narratives", () => ({ classifyPhraseNarrative: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

import { deletePhraseAction } from "./actions";

const id = "cf981a51-e281-4320-851c-6a4da8d63456";
function form(value: string = id) {
  const data = new FormData();
  data.set("id", value);
  return data;
}
beforeEach(() => vi.resetAllMocks());

describe("deletePhraseAction", () => {
  it("rejects an unauthenticated direct action invocation before deleting", async () => {
    auth.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(deletePhraseAction({}, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(remove).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
  it.each(["", "not-a-uuid"])("rejects invalid identifiers: %s", async (value) => {
    expect(await deletePhraseAction({}, form(value))).toHaveProperty("error");
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects missing identifiers", async () => {
    expect(await deletePhraseAction({}, new FormData())).toHaveProperty("error");
    expect(remove).not.toHaveBeenCalled();
  });
  it("deletes the selected phrase after authentication and refreshes the list", async () => {
    remove.mockImplementation(() => expect(auth).toHaveBeenCalledOnce());
    expect(await deletePhraseAction({}, form())).toEqual({ deleted: true });
    expect(remove).toHaveBeenCalledExactlyOnceWith(id);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("/admin/phrases");
  });
  it("returns a retryable error without exposing database details or reporting success", async () => {
    remove.mockRejectedValue(new Error("private database details"));
    const result = await deletePhraseAction({}, form());
    expect(result.error).toBe("No se pudo eliminar la frase. Inténtalo de nuevo.");
    expect(result.deleted).toBeUndefined();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

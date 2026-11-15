import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, submit, revalidate } = vi.hoisted(() => ({
  auth: vi.fn(),
  submit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/admin-session", () => ({ requireAdminSession: auth }));
vi.mock("@/lib/correspondences", () => ({ submitSeedPhraseLetter: submit }));
// letters.ts is loaded for real (the action uses its LETTER_MAX_LENGTH); these stop its
// imports from building real Supabase/OpenAI clients at load time.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/openai", () => ({ moderateText: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

import { submitSeedPhraseLetterAction } from "./actions";

const CORRESPONDENCE_ID = "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70";
const TEXT = "Gracias por escribirme.";

function form({ correspondenceId = CORRESPONDENCE_ID, text = TEXT }: { correspondenceId?: string | null; text?: string | null } = {}) {
  const data = new FormData();
  if (correspondenceId !== null) data.set("correspondenceId", correspondenceId);
  if (text !== null) data.set("text", text);
  return data;
}

beforeEach(() => vi.resetAllMocks());

describe("submitSeedPhraseLetterAction", () => {
  it("rejects an unauthenticated direct action invocation before writing", async () => {
    auth.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(submitSeedPhraseLetterAction({}, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(submit).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("sends the letter after authentication and refreshes the mailbox and the review queue", async () => {
    submit.mockImplementation(async () => {
      expect(auth).toHaveBeenCalledOnce();
      return { type: "held" };
    });

    expect(await submitSeedPhraseLetterAction({}, form())).toEqual({ result: { type: "held" } });
    expect(submit).toHaveBeenCalledExactlyOnceWith({ correspondenceId: CORRESPONDENCE_ID, body: TEXT });
    expect(revalidate).toHaveBeenCalledWith("/admin/mailbox");
    expect(revalidate).toHaveBeenCalledWith("/admin/letters");
  });

  it.each([
    [{ type: "rejected", reason: "contact_info", contactKinds: ["phone"] }],
    [{ type: "not_allowed", reason: "not_your_turn" }],
    [{ type: "not_found" }],
  ])("passes the outcome %j through for the form to explain", async (result) => {
    submit.mockResolvedValue(result);

    expect(await submitSeedPhraseLetterAction({}, form())).toEqual({ result });
  });

  it.each([
    ["no id", null],
    ["an empty id", ""],
    ["an id that isn't a uuid", "correspondence-1"],
  ])("answers an error and writes nothing for %s", async (_label, correspondenceId) => {
    expect(await submitSeedPhraseLetterAction({}, form({ correspondenceId }))).toHaveProperty("error");
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["no text", null],
    ["empty text", ""],
    ["only spaces", "   \n "],
    ["text over 1200 characters", "a".repeat(1201)],
  ])("answers an error and writes nothing for %s", async (_label, text) => {
    expect(await submitSeedPhraseLetterAction({}, form({ text }))).toEqual({
      error: "La carta no puede estar vacía ni pasar de 1200 caracteres.",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts a letter of exactly 1200 characters", async () => {
    submit.mockResolvedValue({ type: "held" });

    expect(await submitSeedPhraseLetterAction({}, form({ text: "a".repeat(1200) }))).toEqual({ result: { type: "held" } });
  });

  it("returns a retryable error without exposing details or refreshing when sending fails", async () => {
    submit.mockRejectedValue(new Error("OpenAI unavailable: private details"));

    expect(await submitSeedPhraseLetterAction({}, form())).toEqual({ error: "No se pudo enviar la carta. Inténtalo de nuevo." });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

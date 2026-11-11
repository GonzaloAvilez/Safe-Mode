// Runs against a real local Postgres (npm run test:integration). Exercises submitLetter
// end to end, mocking only the OpenAI moderation call. letters.test.ts mocks the database,
// so it can't prove what only a real one can: that the embedded select
// ("closed_at, letters(sender, status)") works through PostgREST, that every stored row
// satisfies the letters constraints, and that the one-held-letter index really turns a
// concurrent double submission into "awaiting_review".
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationCheckFixture,
  concerningModerationCheckFixture,
} from "@/test/fixtures/moderation-check";
import { realPhraseFixtures } from "@/test/fixtures/real-phrase-embeddings";
import { LEAVE_A_TRACE_ORIGIN } from "@/lib/phrase-origin";

const { moderateTextMock } = vi.hoisted(() => ({ moderateTextMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({ moderateText: moderateTextMock }));

import { submitLetter } from "@/lib/letters";
import { supabaseAdmin } from "@/lib/supabase";

let identityIds: string[] = [];
let phraseIds: string[] = [];

afterEach(async () => {
  if (phraseIds.length > 0) await supabaseAdmin.from("phrases").delete().in("id", phraseIds);
  if (identityIds.length > 0) await supabaseAdmin.from("identities").delete().in("id", identityIds);
  phraseIds = [];
  identityIds = [];
  vi.clearAllMocks();
});

async function createCorrespondence(): Promise<string> {
  const identity = await supabaseAdmin.from("identities").insert({}).select("id").single();
  if (identity.error) throw identity.error;
  identityIds.push(identity.data.id);

  const phrase = await supabaseAdmin
    .from("phrases")
    .insert({
      text: realPhraseFixtures[1].text,
      embedding: realPhraseFixtures[1].embedding,
      source: "user",
      active: false,
      origin: LEAVE_A_TRACE_ORIGIN,
      moderation_status: "approved",
    })
    .select("id")
    .single();
  if (phrase.error) throw phrase.error;
  phraseIds.push(phrase.data.id);

  const correspondence = await supabaseAdmin
    .from("correspondences")
    .insert({ phrase_id: phrase.data.id, visitor_identity_id: identity.data.id })
    .select("id")
    .single();
  if (correspondence.error) throw correspondence.error;
  return correspondence.data.id;
}

async function storedLetters(correspondenceId: string) {
  const { data, error } = await supabaseAdmin
    .from("letters")
    .select("sender, status, rejection_reason, body")
    .eq("correspondence_id", correspondenceId)
    .order("created_at");
  if (error) throw error;
  return data;
}

describe("submitLetter (integration)", () => {
  it("stores an honest letter as held, then refuses a second one from the same sender", async () => {
    const correspondenceId = await createCorrespondence();
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const first = await submitLetter({ correspondenceId, sender: "visitor", body: "Gracias por tu frase." });
    const second = await submitLetter({ correspondenceId, sender: "visitor", body: "¿Me leíste?" });

    expect(first).toEqual({ type: "held" });
    expect(second).toEqual({ type: "not_allowed", reason: "awaiting_review" });
    expect(await storedLetters(correspondenceId)).toEqual([
      { sender: "visitor", status: "held", rejection_reason: null, body: "Gracias por tu frase." },
    ]);
  });

  it("stores a contact-info rejection without its text (accepted by the real constraints)", async () => {
    const correspondenceId = await createCorrespondence();
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);

    const result = await submitLetter({ correspondenceId, sender: "visitor", body: "Escríbeme al 55 1234 5678" });

    expect(result).toEqual({ type: "rejected", reason: "contact_info", contactKinds: ["phone"] });
    expect(await storedLetters(correspondenceId)).toEqual([
      { sender: "visitor", status: "rejected", rejection_reason: "contact_info", body: null },
    ]);
  });

  it("stores a crisis letter as rejected with its text, and the visitor can still write", async () => {
    const correspondenceId = await createCorrespondence();
    moderateTextMock.mockResolvedValueOnce(concerningModerationCheckFixture);

    const crisis = await submitLetter({ correspondenceId, sender: "visitor", body: "No puedo más." });
    moderateTextMock.mockResolvedValueOnce(benignModerationCheckFixture);
    const retry = await submitLetter({ correspondenceId, sender: "visitor", body: "Gracias por tu frase." });

    expect(crisis.type).toBe("crisis");
    expect(retry).toEqual({ type: "held" });
    expect(await storedLetters(correspondenceId)).toEqual([
      { sender: "visitor", status: "rejected", rejection_reason: "crisis", body: "No puedo más." },
      { sender: "visitor", status: "held", rejection_reason: null, body: "Gracias por tu frase." },
    ]);
  });

  it("follows the real turn order once a letter is delivered", async () => {
    const correspondenceId = await createCorrespondence();
    moderateTextMock.mockResolvedValue(benignModerationCheckFixture);
    await submitLetter({ correspondenceId, sender: "visitor", body: "Gracias por tu frase." });
    await supabaseAdmin
      .from("letters")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("correspondence_id", correspondenceId);

    const visitorAgain = await submitLetter({ correspondenceId, sender: "visitor", body: "¿Sigues ahí?" });
    const authorReply = await submitLetter({ correspondenceId, sender: "author", body: "Gracias a ti." });

    expect(visitorAgain).toEqual({ type: "not_allowed", reason: "not_your_turn" });
    expect(authorReply).toEqual({ type: "held" });
  });

  it("answers not_found for a correspondence that doesn't exist", async () => {
    const result = await submitLetter({
      correspondenceId: "00000000-0000-0000-0000-000000000000",
      sender: "visitor",
      body: "hola",
    });

    expect(result).toEqual({ type: "not_found" });
    expect(moderateTextMock).not.toHaveBeenCalled();
  });

  // The race end to end: moderation takes a while (like the real API), so every
  // submission passes canSendLetter before any of them inserts. Exactly one may win.
  it("turns concurrent submissions into one held letter and awaiting_review for the rest", async () => {
    const correspondenceId = await createCorrespondence();
    moderateTextMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(benignModerationCheckFixture), 150))
    );

    const results = await Promise.all(
      ["clic 1", "clic 2", "clic 3"].map((body) => submitLetter({ correspondenceId, sender: "visitor", body }))
    );

    expect(moderateTextMock).toHaveBeenCalledTimes(3); // all three got past canSendLetter
    expect(results.filter((result) => result.type === "held")).toHaveLength(1);
    expect(results.filter((result) => result.type === "not_allowed")).toEqual([
      { type: "not_allowed", reason: "awaiting_review" },
      { type: "not_allowed", reason: "awaiting_review" },
    ]);
    expect((await storedLetters(correspondenceId)).filter((letter) => letter.status === "held")).toHaveLength(1);
  });
});

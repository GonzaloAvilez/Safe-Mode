import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { createIdentityWithReturnKey } from "@/lib/identity-keys";
import { submitLetter, type SubmitLetterResult } from "@/lib/letters";

// ADR-004 #211: starting a correspondence. A visitor whose entry matched a phrase writes
// the first letter to that phrase's author; the correspondence is created together with
// that letter, never empty (founder decision 2026-11-11).
//
// Entries are never stored with a correspondence (ADR-004 hard rule): the entry is only
// read here to prove the visitor owns it and to find the phrase it matched.

type PhraseOwnership = { identity_id: string | null; source: "seed" | "user" };

// A phrase accepts letters when its author opted in (phrases.identity_id, from #212), or
// when it's a seed phrase: every seed is the founder's own, answered from /admin
// (confirmed 2026-11-11). User phrases from before opt-in existed have no reachable
// author and never accept letters (ADR-004 open decision 5).
export function isPhraseConnectable(phrase: PhraseOwnership): boolean {
  return phrase.identity_id !== null || phrase.source === "seed";
}

export type StartCorrespondenceResult =
  // returnKey is the visitor's only way back to read the reply: shown once, stored hashed.
  // The correspondence exists even if the first letter was rejected, so the visitor can
  // retry with the same key (founder decision 2026-11-11).
  | { type: "started"; correspondenceId: string; returnKey: string; letter: SubmitLetterResult }
  // Not this session's entry, an unknown id, or an entry that didn't match any phrase.
  // One answer for all three, so the route can't be used to probe which entries exist.
  | { type: "entry_not_found" }
  | { type: "phrase_not_connectable" };

type StartCorrespondenceInput = {
  entryId: string;
  sessionId: string;
  body: string;
};

type OwnedEntryRow = {
  entries: { phrases: ({ id: string } & PhraseOwnership) | null } | null;
};

// The phrase this session's entry matched, or null if the entry isn't this session's or
// didn't match. Ownership comes from responses.session_id, written when the entry was
// submitted (same check as the wants_reply toggle, #236).
async function findMatchedPhrase(entryId: string, sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("responses")
    .select("entries(phrases(id, identity_id, source))")
    .eq("entry_id", entryId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as OwnedEntryRow | null)?.entries?.phrases ?? null;
}

async function deleteIdentity(identityId: string): Promise<void> {
  // Cascades to the identity's key, its correspondence and that correspondence's letters.
  const { error } = await supabaseAdmin.from("identities").delete().eq("id", identityId);
  if (error) console.error("startCorrespondence: couldn't clean up identity after a failure", error);
}

export async function startCorrespondence(input: StartCorrespondenceInput): Promise<StartCorrespondenceResult> {
  const phrase = await findMatchedPhrase(input.entryId, input.sessionId);
  if (!phrase) return { type: "entry_not_found" };
  if (!isPhraseConnectable(phrase)) return { type: "phrase_not_connectable" };

  // Key handoff order (#211): every write the key depends on happens before the key is
  // returned. If any of them fails, the identity is deleted and no key leaves the server,
  // so nobody ever holds a key that points to nothing.
  const { identityId, returnKey } = await createIdentityWithReturnKey();

  let correspondenceId: string;
  try {
    const { data, error } = await supabaseAdmin
      .from("correspondences")
      .insert({ phrase_id: phrase.id, visitor_identity_id: identityId })
      .select("id")
      .single();
    if (error) throw error;
    correspondenceId = data.id;
  } catch (error) {
    await deleteIdentity(identityId);
    throw error;
  }

  let letter: SubmitLetterResult;
  try {
    letter = await submitLetter({ correspondenceId, sender: "visitor", body: input.body });
  } catch (error) {
    // Nothing was stored for the letter (e.g. the moderation call failed, fail-closed).
    // Undo the whole start so no empty correspondence is left behind; the visitor retries.
    await deleteIdentity(identityId);
    throw error;
  }

  return { type: "started", correspondenceId, returnKey, letter };
}

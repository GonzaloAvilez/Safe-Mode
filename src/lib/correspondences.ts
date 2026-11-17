import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createIdentityWithReturnKey,
  deleteIdentity,
  hasConfirmedReturnKey,
  resolveIdentityFromReturnKey,
} from "@/lib/identity-keys";
import type { LetterSender } from "@/lib/letter-lifecycle";
import { submitLetter, type SubmitLetterResult } from "@/lib/letters";

// ADR-004 #211: starting a correspondence and writing in it. A visitor whose entry matched
// a phrase writes the first letter to that phrase's author; the correspondence is created
// together with that letter, never empty (founder decision 2026-11-11). After that, each
// side writes its next letter with its return key.
//
// Entries are never stored with a correspondence (ADR-004 hard rule): the entry is only
// read here to prove the visitor owns it and to find the phrase it matched.

type PhraseOwnership = { identity_id: string | null; source: "seed" | "user" };

// Every seed phrase is the founder's own (confirmed 2026-11-11) and has no author
// identity, so the founder answers its letters from /admin, never with a return key. A
// seed phrase that did have an author identity would be answered by that author instead,
// so a correspondence never has two people writing as its author.
export function isAnsweredByFounder(phrase: PhraseOwnership): boolean {
  return phrase.source === "seed" && phrase.identity_id === null;
}

// A phrase accepts letters when its author opted in (phrases.identity_id) and confirmed
// they saved their return key (#212), or when the founder answers it. Without a confirmed
// key, letters would reach someone who can never read them. User phrases from before
// opt-in existed have no reachable author and never accept letters (ADR-004 open
// decision 5).
export function isPhraseConnectable(phrase: PhraseOwnership, authorKeyConfirmed: boolean): boolean {
  return (phrase.identity_id !== null && authorKeyConfirmed) || isAnsweredByFounder(phrase);
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

export async function startCorrespondence(input: StartCorrespondenceInput): Promise<StartCorrespondenceResult> {
  const phrase = await findMatchedPhrase(input.entryId, input.sessionId);
  if (!phrase) return { type: "entry_not_found" };
  const authorKeyConfirmed = phrase.identity_id !== null && (await hasConfirmedReturnKey(phrase.identity_id));
  if (!isPhraseConnectable(phrase, authorKeyConfirmed)) return { type: "phrase_not_connectable" };

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

type CorrespondenceIdentitiesRow = {
  visitor_identity_id: string;
  phrases: { identity_id: string | null } | null;
};

// Which side of the correspondence this identity writes from: the visitor who started it,
// or the author of its phrase. Null when it's neither, or the correspondence doesn't exist.
// A seed phrase has no author identity (the founder answers those from /admin), so only its
// visitor can write through here.
export async function resolveLetterSender(correspondenceId: string, identityId: string): Promise<LetterSender | null> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("visitor_identity_id, phrases(identity_id)")
    .eq("id", correspondenceId)
    .maybeSingle();
  if (error) throw error;

  const identities = data as CorrespondenceIdentitiesRow | null;
  if (!identities) return null;
  if (identities.visitor_identity_id === identityId) return "visitor";
  if (identities.phrases?.identity_id === identityId) return "author";
  return null;
}

type SubmitLetterWithReturnKeyInput = {
  correspondenceId: string;
  returnKey: string;
  body: string;
};

// Either side writes its next letter, authorized only by its return key: the key says who
// is writing, the correspondence says from which side. A key that doesn't exist, or that
// isn't part of this correspondence, gets the same not_found as a correspondence that
// doesn't exist, so the route can't be used to probe which correspondences exist.
export async function submitLetterWithReturnKey(input: SubmitLetterWithReturnKeyInput): Promise<SubmitLetterResult> {
  const identityId = await resolveIdentityFromReturnKey(input.returnKey);
  if (!identityId) return { type: "not_found" };

  const sender = await resolveLetterSender(input.correspondenceId, identityId);
  if (!sender) return { type: "not_found" };

  return submitLetter({ correspondenceId: input.correspondenceId, sender, body: input.body });
}

type CorrespondencePhraseRow = { phrases: PhraseOwnership | null };

async function isAnsweredByFounderCorrespondence(correspondenceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("phrases(identity_id, source)")
    .eq("id", correspondenceId)
    .maybeSingle();
  if (error) throw error;

  const phrase = (data as CorrespondencePhraseRow | null)?.phrases;
  return phrase ? isAnsweredByFounder(phrase) : false;
}

type SubmitSeedPhraseLetterInput = {
  correspondenceId: string;
  body: string;
};

// The founder writes as the author of one of their seed phrases, from /admin/mailbox (the
// caller checks the admin session). Any other correspondence answers not_found, so /admin
// can never write as the author of someone else's phrase.
//
// The letter goes through the same pipeline as every other one, human review included
// (founder decision 2026-11-14): the founder delivers it from /admin/letters, so
// approveLetter stays the only place a letter is delivered, and the one that closes the
// correspondence after its 6th letter.
export async function submitSeedPhraseLetter(input: SubmitSeedPhraseLetterInput): Promise<SubmitLetterResult> {
  if (!(await isAnsweredByFounderCorrespondence(input.correspondenceId))) return { type: "not_found" };

  return submitLetter({ correspondenceId: input.correspondenceId, sender: "author", body: input.body });
}

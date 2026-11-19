import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { createIdentityWithReturnKey, hasConfirmedReturnKey, resolveIdentityFromReturnKey } from "@/lib/identity-keys";
import type { LetterSender } from "@/lib/letter-lifecycle";
import { submitLetter, type SubmitLetterResult } from "@/lib/letters";
import { isLettersOpen } from "@/lib/settings";

// ADR-004 #211: starting a correspondence and writing in it. A visitor whose entry matched
// a phrase keeps a seal first (#212, design B), then writes the first letter to that phrase's
// author; the correspondence is created together with that letter, never empty (founder
// decision 2026-11-11). After that, each side writes its next letter with its return key.
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

type MatchedPhrase = { id: string } & PhraseOwnership;

type OwnedEntryRow = {
  entries: { phrases: MatchedPhrase | null } | null;
};

// The phrase this session's entry matched, or null if the entry isn't this session's or
// didn't match. Ownership comes from responses.session_id, written when the entry was
// submitted (same check as the wants_reply toggle, #236).
async function findMatchedPhrase(entryId: string, sessionId: string): Promise<MatchedPhrase | null> {
  const { data, error } = await supabaseAdmin
    .from("responses")
    .select("entries(phrases(id, identity_id, source))")
    .eq("entry_id", entryId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as OwnedEntryRow | null)?.entries?.phrases ?? null;
}

async function canLettersReach(phrase: PhraseOwnership): Promise<boolean> {
  const authorKeyConfirmed = phrase.identity_id !== null && (await hasConfirmedReturnKey(phrase.identity_id));
  return isPhraseConnectable(phrase, authorKeyConfirmed);
}

type PhraseToWriteTo =
  | { type: "found"; phrase: MatchedPhrase }
  // Not this session's entry, an unknown id, or an entry that didn't match any phrase.
  // One answer for all three, so the routes can't be used to probe which entries exist.
  | { type: "entry_not_found" }
  | { type: "phrase_not_connectable" };

// The one gate for a visitor writing from Mirror: they wrote an entry in this session, it
// matched a phrase, and letters can reach that phrase's author. Asking for a seal and sending
// the first letter both pass through it, so neither can be reached without the other's proof.
async function findPhraseToWriteTo(entryId: string, sessionId: string): Promise<PhraseToWriteTo> {
  const phrase = await findMatchedPhrase(entryId, sessionId);
  if (!phrase) return { type: "entry_not_found" };
  if (!(await canLettersReach(phrase))) return { type: "phrase_not_connectable" };
  return { type: "found", phrase };
}

// Whether Mirror can offer to write to this phrase right now: letters are open and the
// phrase is connectable. Read when an entry matches, so the visitor is only offered a letter
// that could really be sent. A phrase that no longer exists can't be written to.
export async function isPhraseConnectableNow(phraseId: string): Promise<boolean> {
  if (!(await isLettersOpen())) return false;

  const { data, error } = await supabaseAdmin
    .from("phrases")
    .select("identity_id, source")
    .eq("id", phraseId)
    .maybeSingle();
  if (error) throw error;

  return data ? canLettersReach(data as PhraseOwnership) : false;
}

export type CreateVisitorReturnKeyResult =
  // returnKey is shown once and stored hashed. It isn't confirmed yet: nothing can be
  // written with it until its holder shows they kept it (POST /api/return-key/confirm).
  | { type: "created"; returnKey: string }
  | Exclude<PhraseToWriteTo, { type: "found" }>;

type CreateVisitorReturnKeyInput = {
  entryId: string;
  sessionId: string;
};

// ADR-004 #212, seal first (design B, 2026-11-19): a visitor keeps their seal before writing,
// so their first letter only leaves once a reply could really be read. The entry is only the
// proof they may ask for one: nothing ties the seal to the entry or to the phrase, and the
// seal is never stored with either (ADR-004 hard rule).
export async function createVisitorReturnKey(input: CreateVisitorReturnKeyInput): Promise<CreateVisitorReturnKeyResult> {
  const found = await findPhraseToWriteTo(input.entryId, input.sessionId);
  if (found.type !== "found") return found;

  const { returnKey } = await createIdentityWithReturnKey();
  return { type: "created", returnKey };
}

export type StartCorrespondenceResult =
  // The visitor's letter went into their correspondence with this phrase: created now, or
  // already there from an earlier try with the same seal (a rejected first letter, a double
  // click). One visitor and one phrase always share one correspondence. `letter` says what
  // happened to the letter itself.
  | { type: "started"; correspondenceId: string; letter: SubmitLetterResult }
  | Exclude<PhraseToWriteTo, { type: "found" }>
  | { type: "return_key_not_recognized" }
  // The seal exists but was never confirmed: its holder hasn't shown they kept it, so a reply
  // might never be read. Confirm it first.
  | { type: "return_key_not_confirmed" }
  // The seal belongs to the phrase's own author: nobody writes a letter to themselves.
  | { type: "own_phrase" };

type StartCorrespondenceInput = {
  entryId: string;
  sessionId: string;
  returnKey: string;
  body: string;
};

// Unique constraint on correspondences (phrase_id, visitor_identity_id), from the migration
// that created the table.
const ONE_CORRESPONDENCE_PER_VISITOR_AND_PHRASE = "correspondences_phrase_id_visitor_identity_id_key";
const UNIQUE_VIOLATION = "23505";

async function findCorrespondenceId(phraseId: string, visitorIdentityId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .select("id")
    .eq("phrase_id", phraseId)
    .eq("visitor_identity_id", visitorIdentityId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

type FoundOrCreatedCorrespondence = { correspondenceId: string; createdNow: boolean };

async function findOrCreateCorrespondence(phraseId: string, visitorIdentityId: string): Promise<FoundOrCreatedCorrespondence> {
  const existingId = await findCorrespondenceId(phraseId, visitorIdentityId);
  if (existingId) return { correspondenceId: existingId, createdNow: false };

  const { data, error } = await supabaseAdmin
    .from("correspondences")
    .insert({ phrase_id: phraseId, visitor_identity_id: visitorIdentityId })
    .select("id")
    .single();
  if (!error) return { correspondenceId: (data as { id: string }).id, createdNow: true };

  // Expected, not a bug: two tries raced past the lookup above (double click, two tabs) and
  // the unique constraint let only the first one in. This one writes into that one.
  if (error.code === UNIQUE_VIOLATION && error.message.includes(ONE_CORRESPONDENCE_PER_VISITOR_AND_PHRASE)) {
    const winnerId = await findCorrespondenceId(phraseId, visitorIdentityId);
    if (winnerId) return { correspondenceId: winnerId, createdNow: false };
  }
  throw error;
}

// Undoes a correspondence created for a letter that couldn't be stored, so none is ever left
// empty (founder decision 2026-11-11). Logged, not thrown: the caller is already failing with
// the error that matters, and an empty correspondence only waits for the visitor's next try.
async function deleteCorrespondence(correspondenceId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("correspondences").delete().eq("id", correspondenceId);
  if (error) console.error("couldn't clean up a correspondence after a failure", error);
}

// ADR-004 #211 and #212: a visitor writes the first letter to the author of the phrase their
// entry matched, with a seal they already kept and confirmed (createVisitorReturnKey). The
// correspondence is created together with that letter, never empty (founder decision
// 2026-11-11).
export async function startCorrespondence(input: StartCorrespondenceInput): Promise<StartCorrespondenceResult> {
  const visitorIdentityId = await resolveIdentityFromReturnKey(input.returnKey);
  if (!visitorIdentityId) return { type: "return_key_not_recognized" };
  if (!(await hasConfirmedReturnKey(visitorIdentityId))) return { type: "return_key_not_confirmed" };

  const found = await findPhraseToWriteTo(input.entryId, input.sessionId);
  if (found.type !== "found") return found;
  if (found.phrase.identity_id === visitorIdentityId) return { type: "own_phrase" };

  const { correspondenceId, createdNow } = await findOrCreateCorrespondence(found.phrase.id, visitorIdentityId);

  try {
    const letter = await submitLetter({ correspondenceId, sender: "visitor", body: input.body });
    return { type: "started", correspondenceId, letter };
  } catch (error) {
    // Nothing was stored for the letter (e.g. the moderation call failed, fail-closed). Only a
    // correspondence this try created is removed: one from an earlier try keeps its letters.
    if (createdNow) await deleteCorrespondence(correspondenceId);
    throw error;
  }
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

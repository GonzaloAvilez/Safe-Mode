import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";

export async function createResponse(
  entryId: string,
  sessionId: string,
  scaleBefore?: number
): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("responses")
    .insert({ entry_id: entryId, session_id: sessionId, scale_before: scaleBefore ?? null })
    .select("id")
    .single();

  return { id: unwrap(data, error).id };
}

// Backs Mirror's "I would love to connect" toggle — the wants_reply column, true to
// its original D16 fake-door-reply-test name again now that resonance itself has its
// own home in phrase_resonances (see recordResonance). A real toggle rather than a
// one-way flag: a stray/accidental tap can be undone by tapping again, which is the
// signal that the *remaining* true value meant it.
//
// Only the session that wrote the entry can change it (added 2026-11-11): the entry id
// alone used to be enough, so anyone holding an id could flip someone else's toggle.
// Returns whether a row was updated, i.e. whether the entry belongs to this session.
export async function setWantsReply(entryId: string, sessionId: string, value: boolean): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("responses")
    .update({ wants_reply: value })
    .eq("entry_id", entryId)
    .eq("session_id", sessionId)
    .select("id");
  return unwrap(data, error).length > 0;
}

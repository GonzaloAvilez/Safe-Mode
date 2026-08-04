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
export async function setWantsReply(entryId: string, value: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("responses").update({ wants_reply: value }).eq("entry_id", entryId);
  unwrap(null, error);
}

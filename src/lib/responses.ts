import { supabaseAdmin } from "@/lib/supabase";

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

  if (error) throw error;

  return { id: data.id };
}

// Backs Mirror's "resonó conmigo" toggle — reuses the existing wants_reply column
// (originally scoped for D16's fake-door reply test) as the connection-intent signal.
// A real toggle rather than a one-way flag: a stray/accidental tap can be undone by
// tapping again, which is the signal that the *remaining* true value meant it.
export async function setWantsReply(entryId: string, value: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("responses").update({ wants_reply: value }).eq("entry_id", entryId);

  if (error) throw error;
}

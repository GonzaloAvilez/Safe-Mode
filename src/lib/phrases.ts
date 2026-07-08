import { supabaseAdmin } from "@/lib/supabase";
import { moderateText } from "@/lib/openai";
import { resolvePhraseModerationStatus, shouldActivatePhrase } from "@/lib/safety/phrase-moderation";

// Inserts with the table defaults: moderation_status='pending', active=false.
// The phrase is never visible in the public corpus until finalizeUserPhraseModeration runs.
export async function submitUserPhrase(text: string): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .insert({ text, source: "user" })
    .select("id")
    .single();

  if (error) throw error;

  return { id: data.id };
}

// Intended to be scheduled with Next's after() so it runs post-response,
// without making the person who left a trace wait on the moderation call.
export async function finalizeUserPhraseModeration(id: string, text: string): Promise<void> {
  const { flagged } = await moderateText(text);
  const status = resolvePhraseModerationStatus({ flagged });
  const active = shouldActivatePhrase(status);

  const { error } = await supabaseAdmin
    .from("phrases")
    .update({ moderation_status: status, active })
    .eq("id", id);

  if (error) throw error;
}

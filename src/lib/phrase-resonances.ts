import { supabaseAdmin } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-result";

// Idempotent: a repeat tap from the same session on the same phrase is a harmless
// no-op, not an error — the composite primary key does the dedup work, not this code.
export async function recordResonance(phraseId: string, sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("phrase_resonances")
    .upsert({ phrase_id: phraseId, session_id: sessionId }, { onConflict: "phrase_id,session_id", ignoreDuplicates: true });

  unwrap(null, error);
}

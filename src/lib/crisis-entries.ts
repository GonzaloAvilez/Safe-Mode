import { supabaseAdmin } from "@/lib/supabase";

// Crisis text lives only here, never in the general-purpose entries table (see P2 of #20).
export async function insertCrisisContent(entryId: string, text: string): Promise<void> {
  const { error } = await supabaseAdmin.from("crisis_entries").insert({ entry_id: entryId, text });

  if (error) throw error;
}

export const CRISIS_RETENTION_DAYS = 30;

// Anonymizes crisis text once it's older than the retention window. Rows already
// anonymized are skipped so re-running the job is a no-op for them.
export async function anonymizeExpiredCrisisEntries(): Promise<number> {
  const cutoff = new Date(Date.now() - CRISIS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("crisis_entries")
    .update({ text: null, anonymized_at: new Date().toISOString() })
    .lt("created_at", cutoff)
    .is("anonymized_at", null)
    .select("entry_id");

  if (error) throw error;

  return data?.length ?? 0;
}

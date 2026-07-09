import { supabaseAdmin } from "@/lib/supabase";

// Crisis text lives only here, never in the general-purpose entries table (see P2 of #20).
export async function insertCrisisContent(entryId: string, text: string): Promise<void> {
  const { error } = await supabaseAdmin.from("crisis_entries").insert({ entry_id: entryId, text });

  if (error) throw error;
}

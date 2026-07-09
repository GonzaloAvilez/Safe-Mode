import { supabaseAdmin } from "@/lib/supabase";

export async function createResponse(entryId: string, scaleBefore?: number): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("responses")
    .insert({ entry_id: entryId, scale_before: scaleBefore ?? null })
    .select("id")
    .single();

  if (error) throw error;

  return { id: data.id };
}

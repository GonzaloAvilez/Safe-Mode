import { supabaseAdmin } from "@/lib/supabase";
import type { Locale } from "@/lib/locale";
import { excerpt } from "./excerpt";

// Kept behind Home's Suspense boundary so this evidence never delays the rules or
// the rest of the first paint. The phrase is intentionally anonymous and excerpted.
export async function ArrivalPhrase({ locale }: { locale: Locale }) {
  const { data } = await supabaseAdmin
    .from("phrases")
    .select("text")
    .eq("active", true)
    .eq("language", locale)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return <>&ldquo;{excerpt(data.text, 10)}&rdquo;</>;
}

import { supabaseAdmin } from "@/lib/supabase";
import { isResonateEnabled } from "@/lib/settings";
import { routing } from "@/i18n/routing";

// pgvector returns embeddings either as a real array or a "[0.1,0.2,...]" string, depending on driver path.
function parseEmbedding(raw: unknown): number[] {
  return Array.isArray(raw) ? raw : JSON.parse(raw as string);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fetched client-side by ObserveScreen so the ritual transition can run independently
// of how long this takes — see observe-screen.tsx. Previously this ran inline in
// observe/page.tsx as a blocking Server Component; moved here unchanged otherwise.
//
// Filtered to the visitor's own locale — same same-language partitioning principle
// match_phrase already enforces (see 20260720190000_add_match_phrase_language_filter),
// applied here too so the pairwise-similarity constellation never mixes languages
// whose embeddings aren't directly comparable.
export async function GET(request: Request) {
  const locale = new URL(request.url).searchParams.get("locale");
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    return Response.json({ error: "locale doesn't have the correct value" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("phrases")
    .select("id, text, embedding")
    .eq("active", true)
    .eq("language", locale)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // An active row with no embedding shouldn't exist (finalizeUserPhraseModeration
  // only ever sets active:true alongside a real embedding, in the same write) — but
  // this is exactly the null that made this page 500 for every visitor before that
  // fix (2026-07-12), so it stays defensive here too: drop rather than crash on it.
  const rows = (data ?? []).filter((row) => row.embedding !== null);
  const embeddings = rows.map((row) => parseEmbedding(row.embedding));

  // Precompute the full pairwise similarity matrix server-side — the client only ever
  // needs these scores, never the 1536-dim vectors themselves.
  const similarities: number[][] = rows.map(() => new Array(rows.length).fill(0));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      similarities[i][j] = sim;
      similarities[j][i] = sim;
    }
  }

  // Public per-phrase resonate count — deliberate risk-accepted decision 2026-08-02
  // (see docs/workshop-updates/2026-08-02-resonate-public-counter-risk-accepted.md).
  // Gated the same as the button itself: no extra query, no field on the response,
  // when the flag is off.
  const resonateEnabled = await isResonateEnabled();
  const resonanceCountByPhraseId = new Map<string, number>();
  if (resonateEnabled && rows.length > 0) {
    const { data: resonanceRows } = await supabaseAdmin
      .from("phrase_resonances")
      .select("phrase_id")
      .in(
        "phrase_id",
        rows.map((row) => row.id)
      );
    for (const r of resonanceRows ?? []) {
      resonanceCountByPhraseId.set(r.phrase_id, (resonanceCountByPhraseId.get(r.phrase_id) ?? 0) + 1);
    }
  }

  const phrases = rows.map((row) => ({
    id: row.id,
    text: row.text,
    resonanceCount: resonateEnabled ? (resonanceCountByPhraseId.get(row.id) ?? 0) : undefined,
  }));

  return Response.json({ phrases, similarities });
}

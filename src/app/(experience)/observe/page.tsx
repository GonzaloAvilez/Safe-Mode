import { supabaseAdmin } from "@/lib/supabase";
import { ScreenHeader } from "../_shared/screen-header";
import { ObserveCanvas } from "./observe-canvas";

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

export default async function ObservePage() {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .select("id, text, embedding")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) throw error;

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

  const phrases = rows.map((row) => ({ id: row.id, text: row.text }));

  return (
    <>
      <ObserveCanvas phrases={phrases} similarities={similarities} />
      <ScreenHeader tagline="Ecosistema de presencias" />
    </>
  );
}

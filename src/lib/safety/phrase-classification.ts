import type { PhraseClassification } from "@/lib/openai";

const MAX_PUBLIC_NARRATIVE_WORDS = 10;

// Defensive post-processing on top of the model's own instructions and the strict
// JSON schema — a schema guarantees shape, not that confidence stays in range or
// that public_narrative actually respects the word-count contract it was asked for.
export function sanitizeClassification(classification: PhraseClassification): PhraseClassification {
  const words = classification.publicNarrative.trim().split(/\s+/).filter(Boolean);
  const publicNarrative = words.slice(0, MAX_PUBLIC_NARRATIVE_WORDS).join(" ");

  return {
    ...classification,
    publicNarrative,
    confidence: Math.min(1, Math.max(0, classification.confidence)),
  };
}

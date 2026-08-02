import OpenAI from "openai";
import type { SelfHarmScores } from "@/lib/safety/moderation-gate";

// Server-only client. Never import this from a client component.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const MODERATION_MODEL = "omni-moderation-latest";
const CLASSIFICATION_MODEL = "gpt-4o-mini";

// Kept deliberately narrow: the abstraction/third-person/word-count contract is what
// this prompt is responsible for. It does not need to also carry a privacy guarantee —
// phrases are already public, human-approved text (see phrase-moderation.ts), so unlike
// a hypothetical classifier over private entries, there's no re-identification duty
// resting on this prompt alone.
const CLASSIFICATION_SYSTEM_PROMPT = `You are a narrative classifier for short, already-public reflections.
Read the phrase and return only the requested fields.

- public_narrative: third person, abstract, max 10 words — a general emotional
  shape, not a paraphrase of the specific wording.
- transition: the emotional movement the phrase implies, from state to state.
- If the phrase is too short or generic to support a confident read, say so
  honestly with a low confidence value rather than inventing detail.`;

export type EmbeddingResult = {
  embedding: number[];
  totalTokens: number;
};

export async function getEmbedding(text: string): Promise<EmbeddingResult> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return {
    embedding: response.data[0].embedding,
    totalTokens: response.usage.total_tokens,
  };
}

export type ModerationCheck = {
  flagged: boolean;
  selfHarmScores: SelfHarmScores;
};

export async function moderateText(text: string): Promise<ModerationCheck> {
  const response = await openai.moderations.create({
    model: MODERATION_MODEL,
    input: text,
  });

  const result = response.results[0];

  return {
    flagged: result.flagged,
    selfHarmScores: {
      "self-harm": result.category_scores["self-harm"],
      "self-harm/intent": result.category_scores["self-harm/intent"],
      "self-harm/instructions": result.category_scores["self-harm/instructions"],
    },
  };
}

export type PhraseClassification = {
  primaryTheme: string;
  primaryNeed: string;
  transitionFrom: string;
  transitionTo: string;
  publicNarrative: string;
  confidence: number;
  totalTokens: number;
};

export async function classifyPhrase(text: string): Promise<PhraseClassification> {
  const response = await openai.chat.completions.create({
    model: CLASSIFICATION_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "phrase_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            primary_theme: { type: "string" },
            primary_need: { type: "string" },
            transition: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
              },
              required: ["from", "to"],
              additionalProperties: false,
            },
            public_narrative: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["primary_theme", "primary_need", "transition", "public_narrative", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices[0].message.content;
  if (!raw) throw new Error("Classification response had no content.");
  const parsed = JSON.parse(raw);

  return {
    primaryTheme: parsed.primary_theme,
    primaryNeed: parsed.primary_need,
    transitionFrom: parsed.transition.from,
    transitionTo: parsed.transition.to,
    publicNarrative: parsed.public_narrative,
    confidence: parsed.confidence,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}

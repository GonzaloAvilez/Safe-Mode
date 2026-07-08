import OpenAI from "openai";
import type { SelfHarmScores } from "@/lib/safety/moderation-gate";

// Server-only client. Never import this from a client component.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const MODERATION_MODEL = "omni-moderation-latest";

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
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

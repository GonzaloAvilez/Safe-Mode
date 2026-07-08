import type { CreateEmbeddingResponse } from "openai/resources/embeddings";
import type { Moderation, ModerationCreateResponse } from "openai/resources/moderations";

// All moderation categories, kept at a low/benign score by default.
// Individual fixtures override only the categories they care about.
function buildModerationResult(overrides: Partial<Moderation["category_scores"]> = {}): Moderation {
  const lowScores: Moderation["category_scores"] = {
    harassment: 0.001,
    "harassment/threatening": 0.001,
    hate: 0.001,
    "hate/threatening": 0.001,
    illicit: 0.001,
    "illicit/violent": 0.001,
    "self-harm": 0.001,
    "self-harm/instructions": 0.001,
    "self-harm/intent": 0.001,
    sexual: 0.001,
    "sexual/minors": 0.001,
    violence: 0.001,
    "violence/graphic": 0.001,
  };

  const category_scores = { ...lowScores, ...overrides };
  const flagged = Object.values(category_scores).some((score) => score >= 0.5);

  return {
    flagged,
    category_scores,
    categories: {
      harassment: false,
      "harassment/threatening": false,
      hate: false,
      "hate/threatening": false,
      illicit: false,
      "illicit/violent": false,
      "self-harm": category_scores["self-harm"] >= 0.5,
      "self-harm/instructions": category_scores["self-harm/instructions"] >= 0.5,
      "self-harm/intent": category_scores["self-harm/intent"] >= 0.5,
      sexual: false,
      "sexual/minors": false,
      violence: false,
      "violence/graphic": false,
    },
    category_applied_input_types: {
      harassment: ["text"],
      "harassment/threatening": ["text"],
      hate: ["text"],
      "hate/threatening": ["text"],
      illicit: ["text"],
      "illicit/violent": ["text"],
      "self-harm": ["text"],
      "self-harm/instructions": ["text"],
      "self-harm/intent": ["text"],
      sexual: ["text"],
      "sexual/minors": ["text"],
      violence: ["text"],
      "violence/graphic": ["text"],
    },
  };
}

export const embeddingResponseFixture: CreateEmbeddingResponse = {
  object: "list",
  model: "text-embedding-3-small",
  data: [
    {
      object: "embedding",
      index: 0,
      embedding: [0.01, -0.02, 0.03, 0.04, -0.05],
    },
  ],
  usage: {
    prompt_tokens: 6,
    total_tokens: 6,
  },
};

export const benignModerationResponseFixture: ModerationCreateResponse = {
  id: "modr-benign-fixture",
  model: "omni-moderation-latest",
  results: [buildModerationResult()],
};

export const concerningModerationResponseFixture: ModerationCreateResponse = {
  id: "modr-concerning-fixture",
  model: "omni-moderation-latest",
  results: [
    buildModerationResult({
      "self-harm": 0.87,
      "self-harm/intent": 0.91,
    }),
  ],
};

import type { ModerationCheck } from "@/lib/openai";

export const benignModerationCheckFixture: ModerationCheck = {
  flagged: false,
  selfHarmScores: {
    "self-harm": 0,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

export const concerningModerationCheckFixture: ModerationCheck = {
  flagged: true,
  selfHarmScores: {
    "self-harm": 0.9,
    "self-harm/intent": 0.9,
    "self-harm/instructions": 0.9,
  },
};

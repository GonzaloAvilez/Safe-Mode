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

// flagged for a non-self-harm category (e.g. violence) — general, not crisis.
export const generalFlaggedModerationCheckFixture: ModerationCheck = {
  flagged: true,
  selfHarmScores: {
    "self-harm": 0,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

// Not flagged by OpenAI's own categories, but crosses the app's own conservative
// self-harm threshold (CRISIS_THRESHOLD, 0.2) — the case the raw `flagged` boolean
// alone would miss.
export const selfHarmOnlyModerationCheckFixture: ModerationCheck = {
  flagged: false,
  selfHarmScores: {
    "self-harm": 0.25,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

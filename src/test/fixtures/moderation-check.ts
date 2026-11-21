import type { ModerationCheck } from "@/lib/openai";

export const benignModerationCheckFixture: ModerationCheck = {
  flagged: false,
  flaggedCategories: [],
  selfHarmScores: {
    "self-harm": 0,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

export const concerningModerationCheckFixture: ModerationCheck = {
  flagged: true,
  flaggedCategories: ["self-harm", "self-harm/intent"],
  selfHarmScores: {
    "self-harm": 0.9,
    "self-harm/intent": 0.9,
    "self-harm/instructions": 0.9,
  },
};

// flagged for a non-self-harm category — general, not crisis. `violence` alone is what
// grief about how someone died looks like to OpenAI (#265), so letters let this one wait
// for the human review queue; entries record it for /admin/flagged (#261).
export const generalFlaggedModerationCheckFixture: ModerationCheck = {
  flagged: true,
  flaggedCategories: ["violence"],
  selfHarmScores: {
    "self-harm": 0,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

// Aggression aimed at a person, not a description of one: the shape of the real threat in
// the #265 probe, which carried `harassment/threatening` on top of `violence`. Letters
// reject this without a human having to read it.
export const directedAggressionModerationCheckFixture: ModerationCheck = {
  flagged: true,
  flaggedCategories: ["harassment", "harassment/threatening", "violence"],
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
  flaggedCategories: [],
  selfHarmScores: {
    "self-harm": 0.25,
    "self-harm/intent": 0,
    "self-harm/instructions": 0,
  },
};

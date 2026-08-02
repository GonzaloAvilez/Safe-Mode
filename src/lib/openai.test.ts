import { afterEach, describe, expect, it, vi } from "vitest";
import {
  benignModerationResponseFixture,
  classificationResponseFixture,
  concerningModerationResponseFixture,
  embeddingResponseFixture,
} from "@/test/fixtures/openai-responses";
import { shouldTriggerCrisisFlow } from "@/lib/safety/moderation-gate";

const { createEmbeddingMock, createModerationMock, createChatCompletionMock } = vi.hoisted(() => ({
  createEmbeddingMock: vi.fn(),
  createModerationMock: vi.fn(),
  createChatCompletionMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function OpenAIMock() {
    return {
      embeddings: { create: createEmbeddingMock },
      moderations: { create: createModerationMock },
      chat: { completions: { create: createChatCompletionMock } },
    };
  }),
}));

const { getEmbedding, moderateText, classifyPhrase } = await import("@/lib/openai");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getEmbedding", () => {
  it("calls the embeddings API with the given text and the text-embedding-3-small model", async () => {
    createEmbeddingMock.mockResolvedValueOnce(embeddingResponseFixture);

    await getEmbedding("me siento perdido hoy");

    expect(createEmbeddingMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "me siento perdido hoy",
    });
  });

  it("returns the embedding vector from the first result", async () => {
    createEmbeddingMock.mockResolvedValueOnce(embeddingResponseFixture);

    const result = await getEmbedding("me siento perdido hoy");

    expect(result.embedding).toEqual(embeddingResponseFixture.data[0].embedding);
  });

  it("returns the total token count from the response usage", async () => {
    createEmbeddingMock.mockResolvedValueOnce(embeddingResponseFixture);

    const result = await getEmbedding("me siento perdido hoy");

    expect(result.totalTokens).toBe(embeddingResponseFixture.usage.total_tokens);
  });

  it("propagates the error when the embeddings API call fails", async () => {
    createEmbeddingMock.mockRejectedValueOnce(new Error("network error"));

    await expect(getEmbedding("me siento perdido hoy")).rejects.toThrow("network error");
  });
});

describe("moderateText", () => {
  it("calls the moderations API with the given text and the omni-moderation-latest model", async () => {
    createModerationMock.mockResolvedValueOnce(benignModerationResponseFixture);

    await moderateText("me siento perdido hoy");

    expect(createModerationMock).toHaveBeenCalledWith({
      model: "omni-moderation-latest",
      input: "me siento perdido hoy",
    });
  });

  it("returns the flagged value from the first result", async () => {
    createModerationMock.mockResolvedValueOnce(concerningModerationResponseFixture);

    const result = await moderateText("texto preocupante");

    expect(result.flagged).toBe(concerningModerationResponseFixture.results[0].flagged);
  });

  it("extracts only the three self-harm category scores from the response", async () => {
    createModerationMock.mockResolvedValueOnce(concerningModerationResponseFixture);

    const result = await moderateText("texto preocupante");

    expect(result.selfHarmScores).toEqual({
      "self-harm": concerningModerationResponseFixture.results[0].category_scores["self-harm"],
      "self-harm/intent": concerningModerationResponseFixture.results[0].category_scores["self-harm/intent"],
      "self-harm/instructions":
        concerningModerationResponseFixture.results[0].category_scores["self-harm/instructions"],
    });
  });

  it("excludes non self-harm categories from the returned selfHarmScores", async () => {
    createModerationMock.mockResolvedValueOnce(concerningModerationResponseFixture);

    const result = await moderateText("texto preocupante");

    expect(Object.keys(result.selfHarmScores)).toEqual([
      "self-harm",
      "self-harm/intent",
      "self-harm/instructions",
    ]);
  });

  it("returns flagged false with low scores when the content is benign", async () => {
    createModerationMock.mockResolvedValueOnce(benignModerationResponseFixture);

    const result = await moderateText("hoy fue un buen dia");

    expect(result.flagged).toBe(false);
    expect(result.selfHarmScores["self-harm"]).toBeLessThan(0.1);
  });

  it("returns flagged true with a high self-harm score when the content is concerning", async () => {
    createModerationMock.mockResolvedValueOnce(concerningModerationResponseFixture);

    const result = await moderateText("texto preocupante");

    expect(result.flagged).toBe(true);
    expect(result.selfHarmScores["self-harm"]).toBeGreaterThan(0.5);
  });

  it("propagates the error when the moderations API call fails", async () => {
    createModerationMock.mockRejectedValueOnce(new Error("network error"));

    await expect(moderateText("texto preocupante")).rejects.toThrow("network error");
  });
});

describe("moderateText + shouldTriggerCrisisFlow contract", () => {
  it("produces a selfHarmScores shape that triggers the crisis flow when moderation scores are high", async () => {
    createModerationMock.mockResolvedValueOnce(concerningModerationResponseFixture);

    const result = await moderateText("texto preocupante");

    expect(shouldTriggerCrisisFlow(result.selfHarmScores)).toBe(true);
  });
});

describe("classifyPhrase", () => {
  it("calls the chat completions API with gpt-4o-mini and a strict json_schema response format", async () => {
    createChatCompletionMock.mockResolvedValueOnce(classificationResponseFixture);

    await classifyPhrase("a phrase already in the public corpus");

    const call = createChatCompletionMock.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.response_format.type).toBe("json_schema");
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.messages[1]).toEqual({ role: "user", content: "a phrase already in the public corpus" });
  });

  it("parses the classification fields out of the response content", async () => {
    createChatCompletionMock.mockResolvedValueOnce(classificationResponseFixture);

    const result = await classifyPhrase("a phrase already in the public corpus");

    expect(result).toEqual({
      primaryTheme: "grief",
      primaryNeed: "connection",
      transitionFrom: "isolated",
      transitionTo: "seen",
      publicNarrative: "A quiet shift from isolation toward feeling seen",
      confidence: 0.8,
      totalTokens: 58,
    });
  });

  it("throws when the response has no message content", async () => {
    createChatCompletionMock.mockResolvedValueOnce({
      ...classificationResponseFixture,
      choices: [{ message: { content: null } }],
    });

    await expect(classifyPhrase("a phrase")).rejects.toThrow("Classification response had no content.");
  });

  it("propagates the error when the chat completions API call fails", async () => {
    createChatCompletionMock.mockRejectedValueOnce(new Error("network error"));

    await expect(classifyPhrase("a phrase")).rejects.toThrow("network error");
  });
});

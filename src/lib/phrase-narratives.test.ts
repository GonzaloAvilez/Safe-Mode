import { afterEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  selectMock,
  eqMock,
  singleMock,
  upsertMock,
  classifyPhraseMock,
  canSpendTodayMock,
  recordClassificationSpendMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  singleMock: vi.fn(),
  upsertMock: vi.fn(),
  classifyPhraseMock: vi.fn(),
  canSpendTodayMock: vi.fn(),
  recordClassificationSpendMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/openai", () => ({
  classifyPhrase: classifyPhraseMock,
}));

vi.mock("@/lib/spend", () => ({
  canSpendToday: canSpendTodayMock,
  recordClassificationSpend: recordClassificationSpendMock,
}));

const { classifyPhraseNarrative } = await import("@/lib/phrase-narratives");

function setUpChains() {
  fromMock.mockImplementation((table: string) => {
    if (table === "phrases") return { select: selectMock };
    if (table === "phrase_narratives") return { upsert: upsertMock };
    throw new Error(`unexpected table ${table}`);
  });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ single: singleMock });
}

const rawClassification = {
  primaryTheme: "grief",
  primaryNeed: "connection",
  transitionFrom: "isolated",
  transitionTo: "seen",
  publicNarrative: "A quiet shift from isolation toward feeling seen",
  confidence: 0.8,
  totalTokens: 42,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("classifyPhraseNarrative", () => {
  it("throws instead of classifying when the daily spend cap is reached", async () => {
    setUpChains();
    singleMock.mockResolvedValueOnce({ data: { text: "una frase" }, error: null });
    canSpendTodayMock.mockResolvedValueOnce(false);

    await expect(classifyPhraseNarrative("phrase-1")).rejects.toThrow("Daily spend cap reached — try again later.");
    expect(classifyPhraseMock).not.toHaveBeenCalled();
  });

  it("classifies, records spend, and upserts the sanitized result — no source restriction", async () => {
    setUpChains();
    singleMock.mockResolvedValueOnce({ data: { text: "una frase" }, error: null });
    canSpendTodayMock.mockResolvedValueOnce(true);
    classifyPhraseMock.mockResolvedValueOnce(rawClassification);
    upsertMock.mockResolvedValueOnce({ error: null });

    await classifyPhraseNarrative("phrase-1");

    expect(recordClassificationSpendMock).toHaveBeenCalledWith(42);
    expect(upsertMock).toHaveBeenCalledWith({
      phrase_id: "phrase-1",
      primary_theme: "grief",
      primary_need: "connection",
      transition_from: "isolated",
      transition_to: "seen",
      public_narrative: "A quiet shift from isolation toward feeling seen",
      confidence: 0.8,
      model: "gpt-4o-mini",
    });
  });

  it("clamps an out-of-range confidence before upserting", async () => {
    setUpChains();
    singleMock.mockResolvedValueOnce({ data: { text: "una frase" }, error: null });
    canSpendTodayMock.mockResolvedValueOnce(true);
    classifyPhraseMock.mockResolvedValueOnce({ ...rawClassification, confidence: 1.5 });
    upsertMock.mockResolvedValueOnce({ error: null });

    await classifyPhraseNarrative("phrase-1");

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ confidence: 1 }));
  });

  it("throws when the fetch fails", async () => {
    setUpChains();
    singleMock.mockResolvedValueOnce({ data: null, error: new Error("select failed") });

    await expect(classifyPhraseNarrative("phrase-1")).rejects.toThrow("select failed");
  });

  it("throws when the upsert fails", async () => {
    setUpChains();
    singleMock.mockResolvedValueOnce({ data: { text: "una frase" }, error: null });
    canSpendTodayMock.mockResolvedValueOnce(true);
    classifyPhraseMock.mockResolvedValueOnce(rawClassification);
    upsertMock.mockResolvedValueOnce({ error: new Error("upsert failed") });

    await expect(classifyPhraseNarrative("phrase-1")).rejects.toThrow("upsert failed");
  });
});

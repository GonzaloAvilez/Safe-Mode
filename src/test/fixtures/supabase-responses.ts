export const insertPhraseSuccessFixture = {
  data: { id: "phrase-1" },
  error: null,
};

export const insertPhraseErrorFixture = {
  data: null,
  error: new Error("insert failed"),
};

export const updateSuccessFixture = {
  error: null,
};

export const updateErrorFixture = {
  error: new Error("update failed"),
};

export const dailySpendExistingRowFixture = {
  data: { total_usd: 1.5 },
  error: null,
};

export const dailySpendNoRowFixture = {
  data: null,
  error: null,
};

export const dailySpendQueryErrorFixture = {
  data: null,
  error: new Error("query failed"),
};

export const incrementDailySpendSuccessFixture = {
  data: 0.000004,
  error: null,
};

export const incrementDailySpendErrorFixture = {
  data: null,
  error: new Error("rpc failed"),
};

export const matchPhraseFoundFixture = {
  data: [{ id: "phrase-1", text: "no estás solo en esto", similarity: 0.87 }],
  error: null,
};

export const matchPhraseNoneFoundFixture = {
  data: [],
  error: null,
};

export const matchPhraseErrorFixture = {
  data: null,
  error: new Error("rpc failed"),
};

export const insertResponseSuccessFixture = {
  data: { id: "response-1" },
  error: null,
};

export const insertResponseErrorFixture = {
  data: null,
  error: new Error("insert failed"),
};

export const insertEntrySuccessFixture = {
  data: { id: "entry-1" },
  error: null,
};

export const insertEntryErrorFixture = {
  data: null,
  error: new Error("insert failed"),
};

export const insertCrisisContentSuccessFixture = {
  error: null,
};

export const insertCrisisContentErrorFixture = {
  error: new Error("insert failed"),
};

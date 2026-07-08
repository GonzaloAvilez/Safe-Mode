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

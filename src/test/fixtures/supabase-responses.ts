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

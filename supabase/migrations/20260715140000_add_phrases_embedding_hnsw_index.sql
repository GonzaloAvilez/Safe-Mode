-- NOTE: forward-looking infrastructure, not an MVP requirement. match_phrase's full
-- table scan is fine at the seed corpus's current scale (~50 rows) and will keep
-- being fine well past MVP/soft-launch traffic; this was deliberately deferred until
-- either an integration test suite existed to catch a bad index or the corpus
-- approached ~5,000-10,000 active rows (see ROADMAP.md). Added now ahead of that
-- trigger, per explicit direction, as scaling groundwork rather than a fix for a
-- present problem.
--
-- HNSW over IVFFlat: no training/list-count tuning needed (IVFFlat's recall is
-- poor with this few rows relative to any sane `lists` value), and it matches
-- match_phrase's cosine-distance ordering (`<=>`) via vector_cosine_ops.
-- Partial on active = true since match_phrase only ever queries active phrases.
create index phrases_embedding_cosine_hnsw_idx
  on phrases
  using hnsw (embedding vector_cosine_ops)
  where active = true;

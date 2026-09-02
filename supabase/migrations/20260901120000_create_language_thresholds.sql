-- Per-language similarity floor for match_phrase, as its own small table keyed by a
-- single `language` column — not a language-pair table. This is the O(N) shape
-- deliberately chosen over an O(N²) `(lang_a, lang_b)` matrix: with only two languages
-- today the difference is invisible, but it's the direction to grow in if a third
-- language is ever added (calibrate one new row, not a growing set of pair combos).
-- Cross-lingual matching itself stays out of scope — match_phrase still only ever
-- compares same-language pairs (see 20260720190000), so this table never needs a pair
-- key to begin with.
--
-- Seed values:
--   en: 0.4 — unchanged from the live floor (20260728120000), carried over so this
--       migration doesn't alter English's existing match behavior at all.
--   es: 0.5 — the *original* Spanish-calibrated value from 20260711120000, before the
--       2026-07-15 language switch to English forced a recalibration down to 0.4. Not
--       a guess: it's the same number that was already measured against Spanish
--       embeddings once. A thin live snapshot (2026-07-28, n=7 active Spanish phrases,
--       21 pairs — see project memory) already shows Spanish's own p90/p95 sitting
--       above English's at every percentile, consistent with 0.5 being closer to right
--       for Spanish than reusing English's 0.4 would be. Provisional, not final —
--       revisit with the same live-percentile method once real Spanish traffic exists,
--       same as English's own 0.5 -> 0.4 recalibration.
create table language_thresholds (
  language text primary key,
  min_similarity float not null,
  calibrated_at timestamptz not null default now(),
  sample_size int not null
);

-- Threshold calibration is server-owned configuration. The application reads it
-- with the service-role client, so keep direct Data API access deny-by-default,
-- consistent with the project's other internal tables.
alter table language_thresholds enable row level security;

insert into language_thresholds (language, min_similarity, sample_size) values
  ('en', 0.4, 61),
  ('es', 0.5, 7);

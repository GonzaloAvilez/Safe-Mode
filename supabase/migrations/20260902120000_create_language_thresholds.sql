-- One threshold per corpus language. Matching remains same-language only, so adding
-- a locale requires one independently calibrated row rather than a language-pair
-- matrix. Application code will read this table through the service-role client;
-- public roles receive no row policies.
create table language_thresholds (
  language text primary key check (language = btrim(language) and language <> ''),
  min_similarity double precision not null check (min_similarity between -1 and 1),
  calibrated_at timestamptz not null default now(),
  sample_size integer not null check (sample_size >= 0)
);

alter table language_thresholds enable row level security;

-- English keeps the live 0.40 floor calibrated on 2026-07-28. Spanish starts at
-- the earlier 0.50 Spanish-calibrated floor; it remains provisional until the live
-- Spanish corpus is large enough for another percentile analysis (ADR-003).
insert into language_thresholds (language, min_similarity, sample_size) values
  ('en', 0.40, 61),
  ('es', 0.50, 7);

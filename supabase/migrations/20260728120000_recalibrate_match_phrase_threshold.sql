-- Recalibrate match_phrase's minimum-similarity floor from 0.5 to 0.4.
--
-- The original 0.5 (20260711120000) was calibrated empirically against the corpus's
-- original *Spanish* embeddings, targeting ~p90 of its pairwise similarity distribution.
-- After the 2026-07-15 English translation, the corpus's real distribution shifted:
-- measured live against the current (mostly English) active corpus on 2026-07-28, p90 is
-- now ~0.38 and only ~1.45% of all phrase pairs exceed 0.5 — the old constant now behaves
-- closer to a p99 cutoff than the p90 it was designed to be.
--
-- Confirmed against real data, not just the distribution shift: two of the soft-launch's
-- first real entries scored 0.4151 and 0.4325 against a genuinely related phrase
-- ("it's hard but I can continue my day") and got no_match under 0.5 — exactly the
-- "light floating alone" problem raised in the first real user feedback (2026-07-27, see
-- project memory). 0.40 is close to the real p90, recovers both of those real entries,
-- and stays well above the safety floor (nonsense text "asdf qwerty zzz banana wheel
-- 12345" scored a max of 0.2044 against the same corpus — no false-positive risk).
--
-- Same signature as the current function (query_embedding, match_language) — `create or
-- replace` is safe here, no new overload, no drop needed (see
-- postgres-function-signature-change-requires-drop in project memory: that hazard is
-- about changing a function's *parameter list*, not its body).

create or replace function match_phrase(query_embedding vector(1536), match_language text)
returns table (
  id uuid,
  text text,
  similarity float
)
language sql
stable
as $$
  select
    phrases.id,
    phrases.text,
    1 - (phrases.embedding <=> query_embedding) as similarity
  from phrases
  where phrases.active = true
    and 1 - (phrases.embedding <=> query_embedding) > 0.4
    and phrases.language = match_language
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

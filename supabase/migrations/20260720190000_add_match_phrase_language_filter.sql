-- Scope match_phrase to same-language pairs only (Section 2, Task 2). Cross-lingual
-- similarity from text-embedding-3-small is measurably weaker than same-language —
-- matching across languages would surface false positives.
--
-- The parameter list is changing (1 arg -> 2), so per this project's own precedent
-- (see 20260715160000_fix_increment_daily_spend_overload.sql), `create or replace`
-- alone would leave the old 1-arg version coexisting as a separate overload rather
-- than replacing it. Even though the two signatures wouldn't collide (different arg
-- counts, no default on the new parameter), leaving the old one callable would mean
-- language-blind matching is still silently reachable — so it's dropped explicitly.

drop function if exists match_phrase(vector(1536));

create function match_phrase(query_embedding vector(1536), match_language text)
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
    and 1 - (phrases.embedding <=> query_embedding) > 0.5
    and phrases.language = match_language
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

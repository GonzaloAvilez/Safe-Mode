-- Expand step for the per-language matching contract. This overload accepts its
-- calibrated floor explicitly; the deployed two-argument function remains available
-- until every application consumer has migrated. Removing that old overload belongs
-- to a later contract-only migration (ADR-003).
create or replace function match_phrase(
  query_embedding vector(1536),
  match_language text,
  min_similarity double precision
)
returns table (
  id uuid,
  text text,
  similarity double precision
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
    and phrases.language = match_language
    and 1 - (phrases.embedding <=> query_embedding) > min_similarity
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

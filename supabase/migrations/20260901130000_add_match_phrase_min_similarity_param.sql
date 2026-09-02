-- Parameterize match_phrase's similarity floor instead of hardcoding 0.4 in the
-- function body — needed now that a second language (Spanish) is live with its own
-- calibrated floor (see language_thresholds, previous migration). The new 3-arg
-- overload is additive: the existing 2-arg function remains temporarily available for
-- backwards compatibility while updated app code opts into per-language thresholds.
-- Contract must happen in a later deployment, only after all deployed callers are
-- confirmed on this signature. This cannot be a bare replacement because PostgreSQL
-- identifies functions by their parameter types, so changing the parameter list
-- creates a distinct overload.
create or replace function match_phrase(query_embedding vector(1536), match_language text, min_similarity float)
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
    and 1 - (phrases.embedding <=> query_embedding) > min_similarity
    and phrases.language = match_language
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

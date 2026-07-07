-- Returns the closest active phrase to a given embedding, by cosine similarity.
create or replace function match_phrase(query_embedding vector(1536))
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
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

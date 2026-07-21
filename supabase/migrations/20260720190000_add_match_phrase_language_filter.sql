-- Scope match_phrase to same-language pairs only (Section 2, Task 2). Cross-lingual
-- similarity from text-embedding-3-small is measurably weaker than same-language —
-- matching across languages would surface false positives.
--
-- Applying  _expand-contract_ pattern instead to drop original function and replacing, 
-- following this pattern we'll have zero-downtimes because of breaking changes are 
-- comming since this function is called in several parts of the code. 
-- Flow: create new function with 2 args -> keep both functions (1 arg, 2 args) -> 
-- modify code to replace 1 arg func call to 2 arg func call -> drop old 1 arg func


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
    and 1 - (phrases.embedding <=> query_embedding) > 0.5
    and phrases.language = match_language
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

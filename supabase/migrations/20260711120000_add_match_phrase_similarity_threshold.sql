-- match_phrase always returned the single nearest phrase in the table, no matter how
-- far away it actually was (plain `order by ... limit 1`, no floor). Confirmed
-- empirically: a 2-word nonsense string ("test foo") matched a real phrase at
-- similarity 0.077, and a repeated-garbage string at 0.133 — both noise, not
-- resonance, presented to the user as if they were a real reflection.
--
-- 0.5 is not arbitrary: it's the same ATTRACTION_THRESHOLD already used by Observe's
-- canvas for "genuinely similar, not just coincidentally close," and it empirically
-- sits at ~p90 of the seed corpus's own pairwise similarity distribution (50 phrases,
-- 1225 pairs: median 0.38, p95 0.52, max 0.65) — comfortably above the baseline
-- similarity any two unrelated phrases share just from being in the same language and
-- emotional register.
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
    and 1 - (phrases.embedding <=> query_embedding) > 0.5
  order by phrases.embedding <=> query_embedding
  limit 1;
$$;

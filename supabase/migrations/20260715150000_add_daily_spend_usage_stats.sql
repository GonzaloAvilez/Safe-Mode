-- total_usd alone is unusable as a visibility tool at this model's price point
-- (text-embedding-3-small is $0.02/1M tokens) — any realistic usage volume stays under
-- a few thousandths of a dollar, so the admin spend page always reads as "$0.0000"
-- whether nothing happened or a hundred calls did. call_count and total_tokens are
-- already available in every OpenAI embeddings response (usage.total_tokens), so this
-- persists data we were already computing and discarding, at no extra API cost.

alter table daily_spend
  add column call_count integer not null default 0,
  add column total_tokens bigint not null default 0;

create or replace function increment_daily_spend(
  spend_date date,
  amount_usd numeric,
  tokens bigint default 0
)
returns numeric
language sql
as $$
  insert into daily_spend (date, total_usd, call_count, total_tokens, updated_at)
  values (spend_date, amount_usd, 1, tokens, now())
  on conflict (date)
  do update set
    total_usd = daily_spend.total_usd + excluded.total_usd,
    call_count = daily_spend.call_count + 1,
    total_tokens = daily_spend.total_tokens + excluded.total_tokens,
    updated_at = now()
  returning total_usd;
$$;

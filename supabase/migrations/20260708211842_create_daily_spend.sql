-- Tracks accumulated OpenAI spend per day, to enforce the $5/day hard cap.
-- Only embeddings cost money (Moderation API is free), so this is only incremented there.

create table daily_spend (
  date date primary key,
  total_usd numeric(10, 6) not null default 0,
  updated_at timestamptz not null default now()
);

-- Atomic upsert-and-increment: safe under concurrent requests, unlike a read-then-write from the app.
create or replace function increment_daily_spend(spend_date date, amount_usd numeric)
returns numeric
language sql
as $$
  insert into daily_spend (date, total_usd, updated_at)
  values (spend_date, amount_usd, now())
  on conflict (date)
  do update set
    total_usd = daily_spend.total_usd + excluded.total_usd,
    updated_at = now()
  returning total_usd;
$$;

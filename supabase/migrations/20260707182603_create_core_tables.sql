-- Core schema for Safe-Mode: entries (user input) -> phrases (fixed curated corpus) -> responses (before/after reaction)

create extension if not exists vector;

create table entries (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  embedding vector(1536),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table phrases (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  embedding vector(1536),
  source text not null default 'seed' check (source in ('seed', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries (id) on delete cascade,
  scale_before smallint check (scale_before between 1 and 5),
  scale_after smallint check (scale_after between 1 and 5),
  wants_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create index responses_entry_id_idx on responses (entry_id);

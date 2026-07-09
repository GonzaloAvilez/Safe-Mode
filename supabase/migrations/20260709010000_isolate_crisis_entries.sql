-- Isolates crisis-flagged (self-harm) entry text into its own table, separate from the
-- general-purpose entries table. This gives crisis content its own retention policy and
-- a natural seam for tighter internal access as the team grows, without touching how
-- general_flagged/cap_reached/proceed entries are stored.

create table crisis_entries (
  entry_id uuid primary key references entries (id) on delete cascade,
  text text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now()
);

alter table crisis_entries enable row level security;

-- entries.text no longer carries the raw text for flagged_crisis rows; it lives in
-- crisis_entries instead, so the column must allow null for that case.
alter table entries alter column text drop not null;

-- First anonymous public write in the app: a visitor taps "this resonates" on a phrase
-- on Home. Private signal only — the count is never shown to other visitors, only
-- optionally to admin. Dedup via a composite primary key rather than a counter column:
-- ON CONFLICT DO NOTHING makes a repeat tap from the same session a harmless no-op,
-- atomic by construction, with no separate count that could drift out of sync. If a
-- count is ever needed, it's `count(*) group by phrase_id` against this table.
--
-- Applies to any active phrase (seed or user) — unlike phrase_narratives, this never
-- derives or displays anything about what someone wrote, so the source='user' consent
-- scoping that experiment needed doesn't apply here.

create table phrase_resonances (
  phrase_id uuid not null references phrases (id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now(),
  primary key (phrase_id, session_id)
);

alter table phrase_resonances enable row level security;

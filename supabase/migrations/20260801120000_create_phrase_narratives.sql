-- Derived, LLM-generated narrative layer over `phrases` (public, already-consented,
-- human-approved text) for the "public narrative" experiment: an abstract theme/need/
-- transition/public_narrative summary shown on Home alongside a user-submitted phrase's
-- real created_at. Never derived from `entries` — that table stays untouched.
--
-- Isolated into its own table, same reasoning as crisis_entries isolating sensitive
-- content from entries: killing this experiment is `drop table phrase_narratives`,
-- with zero blast radius on `phrases` itself (read by match_phrase, Observe, Home,
-- admin). No history/updated_at — re-classifying a phrase overwrites via upsert,
-- consistent with this being explicitly provisional, not an audit trail.

create table phrase_narratives (
  phrase_id uuid primary key references phrases (id) on delete cascade,
  primary_theme text not null,
  primary_need text not null,
  transition_from text not null,
  transition_to text not null,
  public_narrative text not null,
  confidence numeric(3, 2) not null check (confidence >= 0 and confidence <= 1),
  model text not null,
  created_at timestamptz not null default now()
);

alter table phrase_narratives enable row level security;

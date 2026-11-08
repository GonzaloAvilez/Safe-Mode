-- Part of #202: records which phrase an entry matched, set server-side from
-- match_phrase's result at match time — never client-provided. Lets a future
-- feature join responses.wants_reply = true + entries.id -> matched_phrase_id
-- -> phrases (and later, its author) without changing anything user-facing yet.
alter table entries
  add column matched_phrase_id uuid references phrases (id) on delete set null;

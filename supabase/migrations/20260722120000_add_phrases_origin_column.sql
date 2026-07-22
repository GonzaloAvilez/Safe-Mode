-- Records which screen a user-submitted phrase came from (Leave a Trace or Contribute).
-- Nullable on purpose: seed phrases never came from either screen, so there's no valid
-- default value to backfill existing rows with.

-- TODO(you): write the ALTER TABLE statement. Add a column named `origin`, type `text`,
-- nullable (no NOT NULL, no DEFAULT). Also add a check constraint restricting it to
-- 'leave_a_trace' or 'contribute' — match the style already used for the `source` column
-- in supabase/migrations/20260707182603_create_core_tables.sql
-- (check (source in ('seed', 'user'))).

alter table phrases
    add column origin text null check(origin in ('leave_a_trace', 'contribute'));
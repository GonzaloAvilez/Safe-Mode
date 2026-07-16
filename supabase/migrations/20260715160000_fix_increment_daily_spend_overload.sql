-- The previous migration (20260715150000_add_daily_spend_usage_stats.sql) intended
-- `create or replace function increment_daily_spend(spend_date date, amount_usd numeric,
-- tokens bigint default 0)` to replace the original 2-parameter function. It didn't —
-- Postgres treats a changed argument list as a distinct function identity, so both the
-- old 2-arg and new 3-arg versions ended up coexisting. Because `tokens` has a default,
-- the 3-arg version is also callable with just 2 arguments, which collides with the old
-- function's exact signature. PostgREST can't disambiguate the two and fails every call
-- with PGRST203 ("Could not choose the best candidate function"), as seen live on preview.
--
-- Fix: drop the obsolete 2-arg overload by its exact signature (a function's real
-- identity in Postgres is name + input argument types, not name alone — see
-- https://www.postgresql.org/docs/current/sql-dropfunction.html). This leaves only the
-- 3-arg version, removing the ambiguity. Nothing in the codebase calls the 2-arg form
-- anymore (lib/spend.ts always passes tokens), so nothing is lost by dropping it.

drop function if exists increment_daily_spend(date, numeric);

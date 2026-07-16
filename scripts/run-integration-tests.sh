#!/usr/bin/env bash
# Boots the local Supabase stack (Postgres + PostgREST via Docker, no auth/storage/
# realtime — see supabase/config.toml), applies every migration in supabase/migrations/
# (automatic on `start`), runs the integration test suite against it, then always tears
# the stack down — including on failure, so a broken test run doesn't leave Docker
# containers running.
set -euo pipefail

cleanup() {
  npx supabase stop
}
trap cleanup EXIT

npx supabase start

# Supabase hosted projects created before its "Automatically expose new tables" opt-out
# (rolling out May-Oct 2026, see https://supabase.com/changelog/45329) auto-grant table
# privileges to anon/authenticated/service_role on every CREATE TABLE — so our migrations
# never had to grant them explicitly, and still don't need to for the real linked project.
# A fresh local CLI database does NOT get that auto-grant, so service_role can create the
# stack but gets "permission denied" on every table until we grant it ourselves here. This
# is local/CI bootstrapping, not a schema change, so it stays out of supabase/migrations/.
db_container="$(docker ps --filter "label=com.supabase.cli.project" --format '{{.Names}}' | grep _db_)"
docker exec "$db_container" psql -U postgres -c "
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public to anon, authenticated, service_role;
"

export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"

# `supabase status -o env` only emits JWT_SECRET/ANON_KEY/SERVICE_ROLE_KEY when [auth]
# is enabled in config.toml (it reads them off the running GoTrue service). We disable
# auth here for CI speed (see config.toml), so those vars never appear in that output.
# PostgREST still validates JWTs against config.toml's default jwt_secret regardless of
# whether GoTrue is running, so the standard Supabase CLI local-dev demo service_role
# token below still authenticates — confirmed against this project's own Kong config.
# It isn't a secret: every project that doesn't override jwt_secret gets this same
# fixed token, and it only has any power against 127.0.0.1.
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# src/lib/openai.ts constructs its OpenAI client at module load time, so anything that
# transitively imports it (e.g. src/lib/phrases.ts) throws without this — even though
# these integration tests never actually call OpenAI (embeddings come from the frozen
# fixture, not a live API call). Same placeholder pattern ci.yml already uses.
export OPENAI_API_KEY="ci-placeholder"

npx vitest run --config vitest.integration.config.ts

#!/usr/bin/env bash
# Runs before `npm run dev` (npm's predev convention). Boots the local Supabase stack
# (Postgres + PostgREST via Docker, same as scripts/run-integration-tests.sh) and writes
# .env.development.local pointing the app at it. Never touches the real shared Supabase
# project, so a plain `npm run dev` can't accidentally write real data — see
# local-dev-shared-supabase-env in project memory for the incident that motivated this.
set -euo pipefail

npx supabase start

# Local CLI databases don't get the auto-grant that real hosted Supabase projects have —
# same reasoning as run-integration-tests.sh. Re-running this on an already-granted
# database is a harmless no-op.
db_container="$(docker ps --filter "label=com.supabase.cli.project" --format '{{.Names}}' | grep _db_)"
docker exec "$db_container" psql -U postgres -c "
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public to anon, authenticated, service_role;
"

# .env.development.local is gitignored (matches the .env* pattern) and regenerated on every
# `npm run dev` — nothing here is a real secret. This is the same fixed local-only demo
# service_role JWT already committed in run-integration-tests.sh: identical on every machine
# running the Supabase CLI, and only has any power against 127.0.0.1. Next.js loads
# .env.development.local with higher precedence than .env.local, so this takes effect even if
# .env.local still has real cloud credentials in it — use `npm run dev:cloud` for those.
cat > .env.development.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-dev-anon-placeholder-unused-by-app-code
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
EOF

echo "Local Supabase stack ready at http://127.0.0.1:54321 — .env.development.local written (gitignored, not a secret)."

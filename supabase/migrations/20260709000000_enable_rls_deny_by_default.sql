-- Deny-by-default RLS on all tables. No policies are added, so the anon/authenticated
-- keys can't read or write anything. The service role (supabaseAdmin) bypasses RLS
-- entirely and is unaffected by this migration.

alter table entries enable row level security;
alter table phrases enable row level security;
alter table responses enable row level security;
alter table daily_spend enable row level security;

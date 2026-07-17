-- Generic key-value settings table, admin-controlled. First use: `site_public`, a
-- maintenance-mode style flag gating the whole public app (checked in src/proxy.ts) —
-- a Vercel-free-tier-friendly alternative to Vercel's own preview-only password
-- protection, since `master` can't use that on the free plan.

create table settings (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values ('site_public', true);

-- Deny-by-default, same as every other table (see 20260709000000_enable_rls_deny_by_default) —
-- only supabaseAdmin (service role, bypasses RLS) ever reads/writes this.
alter table settings enable row level security;

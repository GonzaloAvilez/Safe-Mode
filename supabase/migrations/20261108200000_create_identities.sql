-- ADR-004 layer 2, part A (#208): anonymous identities that own content.
-- Rule (ADR-004 "Identity model"): content is owned by an identity, never by a credential.
-- An identity carries no PII, ever. Credentials live in identity_keys; today the only kind
-- is the author's return key, and future kinds (device session, email/OAuth via Supabase
-- Auth) are added by widening the `kind` check, with no data migration.
--
-- `entries` deliberately gets NO identity link, now or with future accounts: they hold
-- crisis-moment writing, and a breach must never expose "this identity wrote this entry".

create table identities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- key_hash: SHA-256 of a 256-bit random token (generated in #209). That entropy makes a
-- slow hash (bcrypt/argon2) unnecessary and lets verification be a direct indexed lookup.
-- The raw key is never stored, so a lost key is unrecoverable by design.
create table identity_keys (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities (id) on delete cascade,
  kind text not null check (kind in ('return_key')),
  key_hash text not null unique,
  created_at timestamptz not null default now()
);

create index identity_keys_identity_id_idx on identity_keys (identity_id);

-- Nullable forever for phrases created before author opt-in existed (ADR-004 open
-- decision 5): those have no reachable author and never will.
alter table phrases
  add column identity_id uuid references identities (id) on delete set null;

create index phrases_identity_id_idx on phrases (identity_id);

-- Deny-by-default, same as every other table: no policies, so anon/authenticated can't
-- touch these through the API.
alter table identities enable row level security;
alter table identity_keys enable row level security;

-- Supabase stopped auto-granting privileges on CREATE TABLE for all projects on
-- 2026-10-30 (https://supabase.com/changelog/45329). Without this, supabaseAdmin (the
-- app's only DB client, service_role) can't see these tables in production. Granted to
-- service_role only: nothing reads them with the anon/authenticated keys. The revoke makes
-- that explicit regardless of environment, since default privileges differ between the
-- local CLI database (still grants anon/authenticated) and hosted projects post-cutoff.
-- RLS already blocks those roles; this is a second, independent layer.
grant select, insert, update, delete on table identities, identity_keys to service_role;
revoke all on table identities, identity_keys from anon, authenticated;

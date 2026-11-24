-- ADR-005 (#271): the devices an identity has asked to be notified on.
--
-- A subscription is owned by an identity, never by a credential (ADR-004 "Identity model").
-- If accounts ever arrive, they're a new credential kind in identity_keys pointing at the same
-- identity, and these rows keep working with no data migration.
--
-- Nothing here identifies a person. There's no link to `entries`, to the sm_session cookie, or to
-- any other table. `endpoint` is the address the browser's push service hands out (Apple, Google,
-- Mozilla), and `p256dh`/`auth` are the keys the notice is encrypted with (RFC 8291). The notice
-- itself never carries letter content (ADR-005).
--
-- `locale` is the language to write the notice in. Identities have no language, so it's the
-- route locale at the moment of subscribing (ADR-003). Like language_thresholds, it isn't
-- pinned to a fixed list, so adding a language needs no migration. The app only writes
-- supported locales.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities (id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%'),
  p256dh text not null check (p256dh <> ''),
  auth text not null check (auth <> ''),
  locale text not null check (locale = btrim(locale) and locale <> ''),
  created_at timestamptz not null default now(),

  -- One row per identity per device, not per device: one browser holds a single push
  -- subscription per site, and one person can own several identities (a trace they left and a
  -- letter they sent). Subscribing again from the same device updates this row. The unique
  -- index also covers looking rows up by identity_id, its leading column.
  unique (identity_id, endpoint)
);

-- When a push service answers 404/410, the subscription is gone for every identity on that
-- device, so every row with that endpoint is deleted at once (ADR-005).
create index push_subscriptions_endpoint_idx on push_subscriptions (endpoint);

-- Deny-by-default, same as every other table: no policies, so anon/authenticated can't touch it
-- through the API.
alter table push_subscriptions enable row level security;

-- Explicit grants, same pattern and reasoning as 20261108200000_create_identities.sql: no
-- auto-grant on CREATE TABLE since 2026-10-30, and the local CLI database still grants
-- anon/authenticated by default.
grant select, insert, update, delete on table push_subscriptions to service_role;
revoke all on table push_subscriptions from anon, authenticated;

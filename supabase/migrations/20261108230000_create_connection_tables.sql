-- ADR-004 layer 2, part B (#208): the letter mailbox between a visitor and a phrase's author.
--
-- Both sides are anonymous identities (decided 2026-11-08): the visitor gets an identity +
-- return key too, so they can come back days later to read the reply.
--
-- No entry_id here, on purpose: storing it next to the visitor's identity would link an
-- entry to an identity indirectly, breaking ADR-004's hard rule that entries are never
-- linked to anyone. entries.matched_phrase_id only validates the request server-side at
-- creation time and is not persisted here.

create table connection_requests (
  id uuid primary key default gen_random_uuid(),
  phrase_id uuid not null references phrases (id) on delete cascade,
  requester_identity_id uuid not null references identities (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Set when the exchange ends. "answered" is derived (a delivered author message exists),
  -- so only the terminal state needs a column. The lifecycle itself lives in #210.
  closed_at timestamptz,
  -- One request per visitor per phrase: makes POST /connect idempotent (ADR-004 layer 4).
  unique (phrase_id, requester_identity_id)
);

create index connection_requests_requester_identity_id_idx on connection_requests (requester_identity_id);

-- sender is a role, not an identity: seed phrases have no author identity (the founder
-- answers them from /admin), and the request already says who the visitor is.
--
-- No cap on messages per request: whether it's one letter each way or bounded N (ADR-004
-- open decision 2) is a domain rule for #210, so the schema doesn't have to change either
-- way. Same for 'held', which only gets used if open decision 1 picks human review.
create table connection_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references connection_requests (id) on delete cascade,
  sender text not null check (sender in ('visitor', 'author')),
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'moderating', 'held', 'rejected', 'delivered')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index connection_messages_request_id_idx on connection_messages (request_id);

-- Deny-by-default, same as every other table.
alter table connection_requests enable row level security;
alter table connection_messages enable row level security;

-- Explicit grants, same pattern and reasoning as 20261108200000_create_identities.sql:
-- no auto-grant on CREATE TABLE since 2026-10-30, and the local CLI database still grants
-- anon/authenticated by default, so least privilege is made explicit.
grant select, insert, update, delete on table connection_requests, connection_messages to service_role;
revoke all on table connection_requests, connection_messages from anon, authenticated;

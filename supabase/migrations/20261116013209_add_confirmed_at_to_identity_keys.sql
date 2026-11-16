-- ADR-004 #212: a return key only counts once the person confirms they saved it
-- (decided 2026-11-08, see the comment on #212).
--
-- The risk it covers: the key is created and shown, but the person never saves it (closed
-- the tab, lost the connection, didn't copy it). Their phrase would then receive letters
-- nobody can ever read. So a phrase only accepts letters once its author's key is
-- confirmed; until then it behaves like a phrase with no author.
--
-- null = not confirmed yet. The app sets it when the person confirms, e.g. by typing the
-- end of their key back. It lives on the credential, not on the identity or the phrase:
-- what gets confirmed is that this credential was saved, and a future credential (an email
-- with accounts, ADR-004 "Identity model") would be confirmed the same way, by verifying
-- it.
--
-- No backfill: keys that already exist stay unconfirmed. Nothing reads this column yet;
-- the PR that starts reading it decides how those keys are treated.
--
-- No `confirmed_at >= created_at` check: created_at comes from the database clock and
-- confirmed_at would come from the app server's, so a small skew between them could
-- reject a legitimate confirmation.
--
-- New column on an existing table: the table-level grant/revoke from
-- 20261108200000_create_identities.sql already covers it.

alter table identity_keys
  add column confirmed_at timestamptz;

-- ADR-004 #210: schema support for the letter rules decided 2026-11-09 (ADR-004 "Letter
-- rules", PR #226): why a letter was rejected, and letter text that can be erased.
--
-- No new tables, so no new grants: the grant/revoke from 20261108230000 still applies.

-- Text can be null in exactly two cases, both enforced below:
--   - anonymized by the retention job (60 days, 30 for crisis), same pattern as crisis_entries
--   - rejected for contact info, whose text is never stored (it holds personal data)
alter table connection_messages alter column body drop not null;

alter table connection_messages add column anonymized_at timestamptz;

-- Why a letter was rejected. Decides what the sender sees and how long the text is kept.
alter table connection_messages add column rejection_reason text
  constraint connection_messages_rejection_reason_check
  check (rejection_reason in ('crisis', 'moderation', 'contact_info', 'review'));

-- A rejected letter always has a reason, and only a rejected letter has one.
alter table connection_messages add constraint connection_messages_rejection_reason_matches_status
  check ((status = 'rejected') = (rejection_reason is not null));

-- Contact-info rejections never keep their text, even by mistake in application code.
alter table connection_messages add constraint connection_messages_contact_info_body_not_stored
  check (rejection_reason is distinct from 'contact_info' or body is null);

-- Missing text must be explained: anonymized, or a contact-info rejection. Anything else
-- is a bug that would silently lose a letter. "is not distinct from", not "=": with a null
-- rejection_reason, "=" yields null, and a CHECK that yields null passes.
alter table connection_messages add constraint connection_messages_body_null_explained
  check (body is not null or anonymized_at is not null or rejection_reason is not distinct from 'contact_info');

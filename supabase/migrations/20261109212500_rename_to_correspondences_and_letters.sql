-- ADR-004 #210: rename the letter tables so the schema says what they hold (decided
-- 2026-11-09). "connection_requests" described only the first moment (a visitor asks to
-- connect), but the row lives for the whole exchange of letters, so:
--
--   connection_requests  → correspondences   (one per visitor ↔ phrase author exchange)
--   connection_messages  → letters           (each letter in it)
--   request_id           → correspondence_id
--   requester_identity_id → visitor_identity_id (letters.sender already says 'visitor')
--
-- Constraints and indexes are renamed too, so error messages and query plans use the new
-- names. Renaming is a catalog-only change: data, grants, RLS and foreign keys are kept.
-- Safe now because nothing in the app reads or writes these tables yet (only tests).

alter table connection_requests rename to correspondences;
alter table connection_messages rename to letters;

alter table correspondences rename column requester_identity_id to visitor_identity_id;
alter table letters rename column request_id to correspondence_id;

-- correspondences
alter table correspondences rename constraint connection_requests_pkey to correspondences_pkey;
alter table correspondences rename constraint connection_requests_phrase_id_fkey to correspondences_phrase_id_fkey;
alter table correspondences rename constraint connection_requests_requester_identity_id_fkey
  to correspondences_visitor_identity_id_fkey;
alter table correspondences rename constraint connection_requests_phrase_id_requester_identity_id_key
  to correspondences_phrase_id_visitor_identity_id_key;
alter index connection_requests_requester_identity_id_idx rename to correspondences_visitor_identity_id_idx;

-- letters
alter table letters rename constraint connection_messages_pkey to letters_pkey;
alter table letters rename constraint connection_messages_request_id_fkey to letters_correspondence_id_fkey;
alter table letters rename constraint connection_messages_sender_check to letters_sender_check;
alter table letters rename constraint connection_messages_status_check to letters_status_check;
alter table letters rename constraint connection_messages_rejection_reason_check to letters_rejection_reason_check;
alter table letters rename constraint connection_messages_rejection_reason_matches_status
  to letters_rejection_reason_matches_status;
alter table letters rename constraint connection_messages_contact_info_body_not_stored
  to letters_contact_info_body_not_stored;
alter table letters rename constraint connection_messages_body_null_explained to letters_body_null_explained;
alter index connection_messages_request_id_idx rename to letters_correspondence_id_idx;

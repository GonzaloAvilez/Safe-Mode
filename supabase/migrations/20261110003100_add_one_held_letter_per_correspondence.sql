-- ADR-004 #210: at most one letter waiting for review per correspondence, enforced by the
-- database ("while a letter waits for review, nobody can write", ADR-004 "Letter rules").
--
-- Why the application check isn't enough: submitLetter (src/lib/letters.ts) reads the
-- correspondence, checks canSendLetter, then calls the moderation API (~1s) before
-- inserting. Two submissions inside that window (a double click, two tabs) both pass the
-- check, because neither sees the other's letter yet, and both insert a held letter
-- (a check-then-act race). If both were later approved, the correspondence would break
-- turn order and getCorrespondenceState would refuse it from then on.
--
-- With this index the check happens inside the write itself: Postgres serializes the two
-- inserts on the index entry, the first commits, and the second fails.
--
-- A violation of this index is EXPECTED, not a bug. submitLetter catches it (SQLSTATE
-- 23505 with this index's name) and answers "awaiting_review", the same answer
-- canSendLetter gives. It will still show up in the Postgres log as
--   duplicate key value violates unique constraint "letters_one_held_per_correspondence"
-- which is what this comment is for. Metrics should count it as a blocked duplicate
-- submission, never as an error (see #214).

create unique index letters_one_held_per_correspondence
  on letters (correspondence_id)
  where status = 'held';

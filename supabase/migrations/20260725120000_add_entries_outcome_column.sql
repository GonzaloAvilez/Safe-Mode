-- Records the real EntryOutcome for each entry (crisis/general_flagged/cap_reached/
-- no_match/matched), so match rate and outcome breakdown can be read from real data
-- instead of console.log. Nullable: existing rows have no way to be re-derived
-- correctly, and even new rows on the "proceed" path don't know matched/no_match until
-- after the insert — this column gets backfilled by a later UPDATE for those.

alter table entries
    add column outcome text null check(outcome in (
        'crisis',
        'general_flagged',
        'cap_reached',
        'no_match',
        'matched'
    ));

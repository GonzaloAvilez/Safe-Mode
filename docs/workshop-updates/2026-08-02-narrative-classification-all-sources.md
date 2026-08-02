# Refugio — Workshop Update

## What we're testing

Whether the public-narrative classifier should apply to every phrase in the corpus,
not just `source='user'` submissions.

## Key decision

Reverses part of `2026-08-01-public-narrative-experiment.md`'s original scoping.
`classifyUserPhrase` (renamed `classifyPhraseNarrative`) no longer rejects
`source='seed'` phrases, and `/admin/phrases`'s "Clasificar" button now shows for
every phrase, not just user submissions.

The original restriction was a consent argument: only classify text someone knew
would be shown publicly. That reasoning holds for `source='user'` (Leave a
Trace/Contribute, explicit submission), but it turns out to have wrongly excluded
seed phrases too — they aren't placeholder content, they're real reflections,
deliberately shared by seeding them into the corpus. Same call already made earlier
today for showing their real `created_at` date (see
`2026-08-02-resonate-*` notes' sibling reasoning) — this just applies it consistently
to narrative classification too.

## Risk being managed

Unchanged from the original writeup — classification still requires an explicit
admin click, one phrase at a time, with the resulting narrative visible in
`/admin/phrases` before it ever reaches Home. Widening eligibility to seed phrases
doesn't introduce a new risk category, since seed phrases already carry the same
"real, consented" status `entries` never has.

## How to disable

Unchanged: `public_narrative_enabled` off from `/admin`.

## Next step

None pending — this closes out the source-scoping inconsistency between date and
narrative found while reviewing `/admin/phrases` after seed phrases became visible
there (#146).

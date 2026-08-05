# Refugio — Workshop Update

## What changed

Home's public-narrative display (see `2026-08-01-public-narrative-experiment.md`) was
scoped to `source='user'` phrases only. `phrase_narratives` coverage was checked
against the live corpus: 24/24 active user phrases classified, 47/48 active seed
phrases also classified — someone had already run `classifyPhraseAction` from
`/admin/phrases` on nearly all seed phrases, but that data went unused on Home because
of the `source === "user"` filter in `fetchPhrasesWithNarratives`. Two-thirds of the
active corpus (the seed phrases) displayed on Home without narrative even though
almost all of them had one sitting in the table.

Home now shows narrative for any active, classified phrase regardless of `source`.

## Why this is safe

Seed phrases are already public, team-authored content — same posture the date
(`created_at`) already had for them (shown regardless of source since the original
experiment). No new privacy surface: this only changes which already-computed,
already-public-scoped rows get rendered, not what gets classified or how.

## What didn't change

- Still gated behind the same `public_narrative_enabled` flag — off reverts Home to
  plain phrase text for every source, same as before.
- Classification is still manual, one phrase at a time, from `/admin/phrases`.
- `entries` are still completely out of scope, per the original experiment.

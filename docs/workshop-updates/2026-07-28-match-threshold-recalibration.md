# Refugio — Workshop Update

## What we tested

Two separate analyses, both computed live against the real Supabase project, read-only:

1. **Corpus-internal distribution** — pairwise cosine similarity across all 61 active English seed phrases, compared against each other (1,830 pairs, `C(61,2)`). This is the distribution the threshold itself was calibrated against.
2. **Real entries vs. corpus** — each of the 50 stored entries that has a saved embedding, compared against those same 61 active phrases, keeping only its single best (highest) similarity.

## Distribution results

### 1. Phrase corpus, internal (1,830 pairs)

| min | p50 | p75 | p90 | p95 | p99 | max | % > 0.4 | % > 0.5 |
|-----|-----|-----|-----|-----|-----|-----|---------|---------|
| 0.0018 | 0.2591 | 0.3295 | 0.3950 | 0.4380 | 0.5289 | 0.7224 | 9.23% | 1.69% |

This tells us how similar two *different* real phrases in the corpus typically are to each other — the baseline "noise level" a real threshold needs to sit above.

### 2. Real entries vs. corpus, best match per entry (50 entries)

| min | p50 | p75 | p90 | max | n | % would clear 0.4 | % would clear 0.5 |
|-----|-----|-----|-----|-----|---|---------|---------|
| 0.1176 | 0.3991 | 0.5105 | 0.6636 | 0.8958 | 50 | 50.0% | 28.0% |

This is the closer proxy for real match rate: for every entry ever submitted with a saved embedding, its single highest similarity against any phrase in the corpus.

**Caveat:** 47 of these 50 entries are pre-launch test entries (2026-07-08 through 2026-07-25), submitted before `site_public` went live (2026-07-27). Only 2 entries come from the actual soft-launch window with outside users, and both were submitted *before* the 0.4 threshold went live (2026-07-28, 14:54 UTC). So there is no real post-change data from actual users yet — this table is mostly development test data, not user testimony, for now.

## Key decision

Lowered the matching threshold from 0.5 to 0.4 after the first real user reported that seeing *no match at all* made them feel **more** alone, not less — worse than the intended experience. Manually reviewed several resulting matches for semantic sense before accepting the change.

## The real finding

Retroactively applying both thresholds to the 50 stored entries shows the threshold change had a real, substantial effect: only 28% would have matched under the old 0.5 floor, versus 50% under the new 0.4 floor — nearly double. The threshold **was** a meaningful lever, not a negligible one.

At the same time, even at 0.4, half of all entries still find no match at all — so corpus coverage is a real, separate limitation, not the only one. Both matter: the threshold controls how forgiving matching is at the margin, but a corpus that doesn't yet cover someone's actual emotional range can't be fixed by threshold tuning alone.

## Risk being managed

We're weighing two failure modes:
- **No match** → confirms the user's fear of being alone (worse, already observed)
- **Weak match** → mild disappointment, "doesn't quite fit" (lower risk, not yet confirmed as harmful)

Accepting more of the second risk temporarily while the corpus grows, and collecting explicit feedback on match quality to validate that assumption rather than assume it.

## Next step

Expand the seed corpus — still a real, unresolved gap even after the threshold fix. In parallel, keep watching real match rate as more soft-launch users submit entries under the new 0.4 threshold — there isn't enough real post-change data yet to know how much it actually helped in production.

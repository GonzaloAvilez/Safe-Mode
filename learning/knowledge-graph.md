# Knowledge Graph

Statuses: `seed` (named, not yet explained) → `introduced` (explained once, gaps remain) →
`practicing` (applied/debugged once) → `understood` (explained correctly, unprompted).
Set only from what I demonstrate in conversation — never from self-report or from files
Claude read on its own.

## embedding-generation
**Status:** introduced — 2026-07-16
Turning a piece of text into a vector via OpenAI (`text-embedding-3-small`), so it can be
compared to other text mathematically instead of by keyword.
**Evidence:** described the overall step ("call to openAI to get the embedding of that
phrase... required to be compared with phrases in DB") correctly in the Q1 walkthrough,
but placed it *before* the moderation check in the sequence — see [[moderation-gate-ordering]].
**depends-on:** none

## vector-similarity-threshold
**Status:** understood — 2026-07-16
The 0.5 cosine-similarity floor in the `match_phrase` Postgres function — without it, the
nearest phrase is always returned even when it's noise (empirically: nonsense text once
matched a real phrase at similarity 0.077).
**Evidence:** correctly located it as "a definition using pgvector, then is living in
supabase logic" — not in the tests, not in app code, in the SQL function itself. Free
recall, unprompted after one nudge.
**depends-on:** [[embedding-generation]]

## moderation-gate-ordering
**Status:** seed — 2026-07-16
Moderation runs *before* embedding generation, not after — flagged text never gets
embedded at all, which is both a cost control (no wasted OpenAI spend on flagged
content) and a safety property (flagged text never touches the matching corpus).
**Evidence:** Q1 walkthrough described embedding first, moderation/crisis-check second —
the actual order in `lib/entries.ts::submitEntry` is inverted from this. Named directly,
not yet corrected through demonstration.
**depends-on:** [[embedding-generation]]

## crisis-text-isolation
**Status:** seed — 2026-07-16
Crisis-flagged text is written to `crisis_entries` in the *same* request that creates the
`entries` row — the `entries.text` column is `null` from the very first write for a
crisis entry, never populated and later moved.
**Evidence:** Q3 described it as "stored in the same table" initially, "separated... after
some time" — this is the load-bearing safety invariant from Issue #20 P2, and the mental
model has it backwards. Good candidate for a reclaim task.
**depends-on:** none

## crisis-anonymization-cron
**Status:** introduced — 2026-07-16
A scheduled job (`/api/cron/anonymize-crisis-entries`) scrubs `crisis_entries.text` to
`null` once a row is older than 30 days (`CRISIS_RETENTION_DAYS`).
**Evidence:** correctly recalled unprompted in Q3 — "This data is moved to another table
and is anonymized... We use a cron job to do that" (the "moved to another table" part
belongs to [[crisis-text-isolation]] instead, but the cron/retention mechanism itself was right).
**depends-on:** [[crisis-text-isolation]]

## rls-service-role-bypass
**Status:** seed — 2026-07-16
Every table denies all access by default (RLS). The app's own reads/writes go through a
single privileged `service_role` key (`src/lib/supabase.ts`'s `supabaseAdmin`), which
bypasses RLS entirely — and an enforced `import "server-only"` guard stops that key from
ever reaching client-side code.
**Evidence:** Q6 answer was generic ("a kind of authentication... preventing injections")
— didn't name the service-role key, the RLS-bypass mechanism, or the server-only guard.
This is the mechanism underneath everything else probed today — high-value reclaim target.
**depends-on:** none

## site-visibility-flags
**Status:** introduced — 2026-07-16
Two independent feature flags (`site_public`, `contribute_open`) in a generic `settings`
table, read in `proxy.ts` to gate routes — scoped per environment after an early version
shared one row across preview/prod/dev.
**Evidence:** Q5 — correctly explained the two-flag split and why `/admin` and
`/api/phrases` stay reachable for `/contribute` seeding. Missed that `/api/phrases` also
backs Leave a Trace's own submit (not just Contribute), and got `/api/cron`'s exemption
backwards (called it non-dangerous to gate; it's actually what keeps
[[crisis-anonymization-cron]] running while the site is closed).
**depends-on:** [[rls-service-role-bypass]]

## ritualized-loading-ux
**Status:** understood — 2026-07-16
The `Searching` screen (and Observe's arrival transition, same pattern) exists to turn
OpenAI's response latency into something that feels intentional rather than like a stalled
UI — "la latencia técnica se vuelve ritual" per the code's own comment.
**Evidence:** Q4 free recall matched the code's intent precisely, unprompted: "the
justification is the time waiting a response from OpenAI... show something to the user
tha don't feel like low latency."
**depends-on:** none

## observe-pairwise-similarity
**Status:** seed — 2026-07-16
`/api/observe` precomputes a full pairwise cosine-similarity matrix, server-side, across
all active phrases — a separate O(n²) computation from `match_phrase`'s single nearest-
neighbor query, used to drive Observe's canvas visualization rather than matching.
**Evidence:** not yet probed directly; named because it's adjacent to the pipeline asked
about in Q1 and is a real second matching-adjacent code path someone could confuse with
`match_phrase`.
**depends-on:** [[embedding-generation]], [[vector-similarity-threshold]]

## daily-spend-cap
**Status:** seed — 2026-07-16
A $5/day hard cap on OpenAI spend, checked before every embedding call
(`canSpendToday`/`estimateEmbeddingCostUsd`/`recordEmbeddingSpend` in `lib/spend.ts`),
skipped entirely when text is already flagged since the outcome can't change.
**Evidence:** touched only implicitly in Q1 ("cap_reached" wasn't mentioned); not yet
explained.
**depends-on:** [[moderation-gate-ordering]]

## admin-audit-not-gate-model
**Status:** seed — 2026-07-16
User-submitted phrases activate automatically the moment OpenAI's moderation verdict
comes back clean — no human approves before publish. `/admin/phrases` is an
after-the-fact audit/override layer, not a pre-publish gate. (Explicitly flagged in
ROADMAP.md as an open question — connects to the parking-lot item on human pre-approval.)
**Evidence:** not yet probed.
**depends-on:** [[moderation-gate-ordering]]

## next-proxy-middleware
**Status:** seed — 2026-07-16
Next 16 renamed Middleware to Proxy; `src/proxy.ts` intercepts every request (matcher
excludes only static assets) before routes render, checking the admin-session cookie and
visibility flags.
**Evidence:** Q5 covered *what* the flags do but not the Proxy mechanism itself (that it
runs before every request, the matcher config, why it's not just page-level logic).
**depends-on:** [[site-visibility-flags]]

## supabase-migrations-workflow
**Status:** seed — 2026-07-16
Schema, RPC functions (`match_phrase`), indexes, and RLS policies are all defined as
timestamped SQL files in `supabase/migrations/`, applied in order — the source of truth
for the database, not something configured by hand in Supabase Studio.
**Evidence:** touched indirectly in Q2 (correctly pointed at "supabase logic" for the
threshold) but the migration-file mechanism itself hasn't been walked.
**depends-on:** none

## integration-tests-real-postgres
**Status:** seed — 2026-07-16
The current branch's own work: `vitest.integration.config.ts` +
`scripts/run-integration-tests.sh` run a subset of tests against a real local Postgres
(via Supabase CLI) rather than mocks, specifically for DB-adjacent logic like
`match_phrase` and the daily-spend RPCs.
**Evidence:** not yet probed — this is literally what's on the current git branch
(`week2/integration-tests-migrations`), a natural first reclaim target since it's the
freshest code.
**depends-on:** [[supabase-migrations-workflow]]

## Missing/absent practices
None load-bearing found missing — git history is deep and disciplined (141 commits,
branch-per-concern), CI gates lint/typecheck/test/build on both `master` and `preview`,
env vars are separated via `.env.local`/`.env.example`, and both unit and integration
tests exist. The gap here isn't process, it's that none of it has been explained by the
person who owns the project yet — that's what the sections in `plan.md` are for.

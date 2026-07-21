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
**Status:** practicing — 2026-07-20
Schema, RPC functions (`match_phrase`), indexes, and RLS policies are all defined as
timestamped SQL files in `supabase/migrations/`, applied in order — the source of truth
for the database, not something configured by hand in Supabase Studio. A dedicated CI
workflow (`deploy-migrations.yml`) runs `supabase db push` against the real project
automatically whenever `supabase/migrations/**` changes land on `master` — which is why
migrations get their own branch/PR, never bundled with app code (a schema change would
otherwise ship at the exact same moment as unrelated code).
**Evidence:** wrote and debugged a real migration
(`20260720180000_add_phrases_language_column.sql`) end to end against local Postgres:
predicted correctly that adding a `NOT NULL` column with no default would fail against
existing rows, saw it fail for real, then iterated through two more broken attempts (a
syntax error combining `SET NOT NULL DEFAULT` in one clause, then a version that split
`ADD COLUMN` / `SET DEFAULT` / `SET NOT NULL` into separate steps — which still failed
because `SET DEFAULT` doesn't retroactively fill existing rows) before landing on the
correct single-statement form and explaining why it works, unprompted, in the chat.
Verified the full 15-migration set still applies clean via `supabase db reset`. Task 2
added a second real migration (`20260720190000_add_match_phrase_language_filter.sql`,
extending `match_phrase`), verified the full 16-migration set still applies clean.
**depends-on:** none

## postgres-function-signature-change-requires-drop
**Status:** practicing — 2026-07-20
Changing a Postgres function's parameter list via `create or replace` doesn't replace
the old version — Postgres identifies a function by name *and* argument types, so the
old and new signatures coexist as separate overloads. If the new parameter has a
default, the two can become ambiguous (same callable arg count) and PostgREST fails
every call (`PGRST203`) — this already happened for real on `increment_daily_spend`
(`20260715160000_fix_increment_daily_spend_overload.sql`). Even *without* a default,
where no ambiguity error occurs, the old overload staying alive is still a hazard: it
remains silently callable with its old (now-wrong) behavior. The fix either way is the
same — `drop function if exists <name>(<old signature>);` before creating the new one.
**Evidence:** first explanation was imprecise ("Postgres keeps calling the first one
defined") — corrected after being pointed back at the project's own past-incident
migration comment, then explained the ambiguity mechanism correctly and asked, sharply,
what would happen without a default on the new parameter. After being told that case
doesn't collide but still shouldn't be left in place, generalized it unprompted into a
standing rule: any migration that changes a function's parameter count should drop and
replace the old one outright.
**depends-on:** [[supabase-migrations-workflow]]

**Refined 2026-07-21:** the drop isn't always immediate — see [[expand-contract-deploy-pattern]].
Under real production traffic, dropping the old signature in the same migration that adds
the new one creates its own outage risk, since schema deploys and app-code deploys aren't
atomic together.

## expand-contract-deploy-pattern
**Status:** practicing — 2026-07-21
Ship a backward-compatible "expand" migration first (new function/column alongside the old
one, safe to merge and deploy anytime because nothing currently deployed breaks), deploy
the app code that uses the new shape, confirm it's live, *then* ship a separate "contract"
migration that removes the old shape. Exists because `deploy-migrations.yml` pushes schema
changes to the real database independently of app-code deploys — a migration that both adds
a new function signature and drops the old one in the same step means any not-yet-updated
app code gets a live 500 the instant that migration merges, and under real traffic that's
not a hypothetical.
**Evidence:** asked unprompted whether reducing/avoiding this class of 500 was possible
under high traffic. When told both `match_phrase` signatures could coexist safely (no
`DEFAULT` on the new parameter), immediately pushed back with the sharper question — doesn't
keeping both alive reintroduce the same overload ambiguity as the `increment_daily_spend`
incident, making the risk "even higher" since it would need an immediate revert? Correctly
anticipated the right failure mode to worry about, even though the specific case turned out
safe. Rewrote `20260720190000_add_match_phrase_language_filter.sql` to the expand-only form
(dropped the premature `drop function`, switched to `create or replace`, reasoning correctly
that `or replace` only touches a function with the exact same signature). Verified together
against local Postgres, both via `pg_proc` and a real PostgREST HTTP call.
**depends-on:** [[supabase-migrations-workflow]], [[postgres-function-signature-change-requires-drop]]

## test-coverage-boundary-reasoning
**Status:** understood — 2026-07-21
Knowing which layer a given test actually exercises, and which it doesn't — e.g. a unit
test that mocks a dependency proves what the caller *does with the mock's return value*,
never what arguments it *calls the mock with*, unless there's an explicit
`toHaveBeenCalledWith` assertion. Distinct from "does this test pass" — it's reasoning
about what a green suite does and doesn't actually guarantee.
**Evidence:** demonstrated twice, unprompted, on different days. 2026-07-20: asked why
integration tests hadn't caught a schema/app mismatch, then correctly reasoned that
`match_phrase` not yet being called with a language argument meant there was nothing yet
for a language-mismatch test to catch. 2026-07-21: before running the suite, asked whether
`entries.test.ts` needed its own assertion or was "already covered" by the integration
tests — correctly identified that `entries.test.ts` mocks `findClosestPhrase` entirely, so
it could only ever verify what `submitEntry` *does with* the mock's return value, never
that it *calls* the mock with the right language — a real, distinct gap neither the unit
test in `phrases.test.ts` nor the integration test would have caught.
**depends-on:** none

## e2e-test-cost-tradeoffs
**Status:** introduced — 2026-07-21
Whether a one-off verification script (browser automation, real API calls) should graduate
into permanent, committed test-suite code is its own decision, separate from whether the
script proved what it set out to prove. Real costs to weigh: recurring real API spend if it
runs in CI, flakiness from timing-based waits standing in for real ready-state signals,
missing fixture cleanup, and overlap with cheaper tests that already cover the same logic
path without a browser or real API calls.
**Evidence:** after a real Playwright script proved Section 2's language segmentation
end-to-end (English submission matched the English seed phrase, correctly skipped the
Spanish one), asked unprompted whether it was worth adding to the repo permanently. Agreed
with the reasoning once walked through it (real OpenAI cost in CI, `waitForTimeout`-based
waits for the ritual transitions are fragile, no cleanup of seeded rows, redundant with the
planned `submitEntry` integration test) rather than reflexively committing something that
had just worked once — the question itself, asked before being told the answer, is the
evidence; the tradeoff analysis was mine, not yet independently reasoned.
**depends-on:** [[test-coverage-boundary-reasoning]]

## postgres-add-column-not-null-default
**Status:** practicing — 2026-07-20
Adding a column with `NOT NULL` and `DEFAULT` declared together in the *same*
`ADD COLUMN` statement lets Postgres treat every existing row as if it already had that
default value, without physically rewriting the table — no separate backfill `UPDATE`
needed. Splitting it into separate steps (`ADD COLUMN` nullable, then `SET DEFAULT`,
then `SET NOT NULL`) does not work: `SET DEFAULT` only applies to rows inserted after
that point, so the later `SET NOT NULL` still fails against the old rows, which are
still `NULL`.
**Evidence:** initially assumed the split-into-3-steps version was necessary (matching
what was demonstrated first). When asked why `NOT NULL DEFAULT` in one step wouldn't
just work, correctly guessed it should. Confirmed live against local Postgres, then after
seeing the `SET DEFAULT`-doesn't-backfill failure, explained correctly in the chat: doing
it together means the change "applies in the same iteration conforming as the column is
created," unlike separately, since `SET DEFAULT` alone doesn't overwrite the existing
rows.
**depends-on:** [[supabase-migrations-workflow]]

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

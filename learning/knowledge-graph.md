# Knowledge Graph

Statuses: `seed` (named, not yet explained) → `introduced` (explained once, gaps remain) →
`practicing` (applied/debugged once) → `understood` (explained correctly, unprompted).
Set only from what I demonstrate in conversation — never from self-report or from files
Claude read on its own.

## nextjs-dev-lazy-module-execution
**Status:** practicing — 2026-07-29
`next build` eagerly executes module-level code (like `const openai = new OpenAI(...)` in
`src/lib/openai.ts`) for every route while collecting page data — confirmed by `ci.yml`'s own
comment. `next dev` is different: it compiles and executes each route's modules lazily, only
the first time that specific route is actually requested — not at `npm run dev` startup.
Construction (`new OpenAI(...)`) throws immediately if `OPENAI_API_KEY` is unset (verified
directly in the installed SDK source, `node_modules/openai/client.js`), which is distinct from
invocation (actually calling the API) — the crash happens at module-load time, not at the
moment an embedding is requested.
**Evidence:** first asked a precise clarifying question distinguishing construction from
invocation, and asking whether the claim was about `next build` or `next dev`/route-entry —
correctly identified this was the exact ambiguity worth resolving before answering. Then
predicted, unprompted and precisely: the app boots fine, but fails specifically when a route
importing `openai.ts` is hit (named `/api/entries` and `/api/phrases` directly), attributing it
correctly to lazy module execution in dev mode. Verified live: backed up `.env.local`, blanked
`OPENAI_API_KEY`, ran the real dev server, and `POST /api/entries` produced exactly the
predicted 500 with `at new OpenAI (...) at module evaluation (...)` in the stack trace —
prediction confirmed against real behavior, not just the SDK source reading.
**depends-on:** none

## ci-cd-workflow-triggers
**Status:** practicing — 2026-07-29
Three separate GitHub Actions workflows, each with a different trigger shape: `ci.yml` runs
unconditionally on every PR/push to `master`/`preview` (lint, `tsc`, unit tests, build) — no
path filter, always pays the cost. `integration-tests.yml` and `deploy-migrations.yml` are
both path-filtered (migrations, `entries.ts`, `phrases.ts` for the first; only
`supabase/migrations/**` for the second) so unrelated PRs (UI, copy) never pay for spinning
up real Postgres or touching production schema. `deploy-migrations.yml` additionally only
fires on `push` to `master`, never on `pull_request` — it's the one that actually pushes to
the real database.
**Evidence:** asked, given a hypothetical PR that only changes a button label and adds a
font-size setting (issue #124, real, not hypothetical for long), which of the three
workflows would run. Correctly identified, unprompted and in one pass, that only `ci.yml`
runs unconditionally, and that neither `integration-tests.yml` nor `deploy-migrations.yml`
would ever fire — not just for the PR, but reasoned correctly that the eventual merge to
`master` wouldn't trigger the migrations deploy either, since the change never touches
`supabase/migrations/**`.
**depends-on:** [[supabase-migrations-workflow]]

## embedding-generation
**Status:** introduced — 2026-07-16
Turning a piece of text into a vector via OpenAI (`text-embedding-3-small`), so it can be
compared to other text mathematically instead of by keyword.
**Evidence:** described the overall step ("call to openAI to get the embedding of that
phrase... required to be compared with phrases in DB") correctly in the Q1 walkthrough,
but placed it *before* the moderation check in the sequence — see [[moderation-gate-ordering]].
**depends-on:** none

## vector-similarity-threshold
**Status:** understood — last-reviewed 2026-07-23
The 0.5 cosine-similarity floor in the `match_phrase` Postgres function — without it, the
nearest phrase is always returned even when it's noise (empirically: nonsense text once
matched a real phrase at similarity 0.077).
**Evidence:** correctly located it as "a definition using pgvector, then is living in
supabase logic" — not in the tests, not in app code, in the SQL function itself. Free
recall, unprompted after one nudge.
**Reviewed 2026-07-23 (7 days later):** passed — correctly recalled it as an empirically
calibrated threshold controlling whether any match is returned at all. Also raised, on
their own, a real open question the review didn't ask for: the 0.5 cutoff was calibrated
against the corpus's original Spanish embeddings — nobody has re-validated it against the
now-English corpus (post Section 2's language migration), and cosine-similarity
distributions aren't guaranteed to match across languages. Worth a future backlog item,
not solved today.
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
**Status:** introduced — 2026-07-22
Every table denies all access by default (RLS). The app's own reads/writes go through a
single privileged `service_role` key (`src/lib/supabase.ts`'s `supabaseAdmin`), which
bypasses RLS entirely — and an enforced `import "server-only"` guard stops that key from
ever reaching client-side code.
**Evidence:** Q6 answer was generic ("a kind of authentication... preventing injections")
— didn't name the service-role key, the RLS-bypass mechanism, or the server-only guard.
This is the mechanism underneath everything else probed today — high-value reclaim target.
**Partial progress 2026-07-22:** engaged correctly with the `server-only` guard half of
this concept (not yet the RLS/service-role-key half). Proposed, unprompted, sharing an
`origin` constant across the two client forms and the server-side route/lib code —
before being told about the `server-only` constraint — then, once told a client
component importing `phrases.ts` would break the build (since it transitively imports
`supabase.ts`'s `import "server-only"`), correctly reasoned the fix was a new file with
zero dependencies, safe for both sides. The RLS/service-role-key half is still unconfirmed
— still the higher-value reclaim target.
**depends-on:** none

## site-visibility-flags
**Status:** understood — 2026-07-27
Two independent feature flags (`site_public`, `contribute_open`) in a generic `settings`
table, read in `proxy.ts` to gate routes — scoped per environment (`key:VERCEL_ENV`) after
an early version shared one row across preview/prod/dev. `isSitePublic` fails open
(defaults `true` if no row exists); `isContributeOpen` fails closed (defaults `false`) —
deliberately different, since one is the product's default-on state and the other is a
temporary seeding surface.
**Evidence:** Q5 — correctly explained the two-flag split and why `/admin` and
`/api/phrases` stay reachable for `/contribute` seeding. Missed that `/api/phrases` also
backs Leave a Trace's own submit (not just Contribute), and got `/api/cron`'s exemption
backwards (called it non-dangerous to gate; it's actually what keeps
[[crisis-anonymization-cron]] running while the site is closed).
**Gaps closed 2026-07-27 (Section 5, Task 1):** both re-derived correctly and unprompted,
directly from `proxy.ts`, not from memory.
**Extended same day, Task 2:** independently reasoned through the fail-open consequence
after reading `isSitePublic`'s default — predicted, correctly, that the real
`site_public:production` row would exist with `value: false` (not simply be absent),
reasoning the site was deliberately closed rather than accidentally-open-by-default.
Verified directly against the real Supabase `settings` table before flipping anything.
Then reasoned through a real go/no-go decision with concrete criteria (bot/rate-limit
protection already shipped, URL not yet distributed, a feedback channel available to catch
issues) rather than a reflexive "why not," and flipped it through the actual `/admin` UI
control (`setSitePublicAction`), not a direct database write.
**Upgraded to understood 2026-07-27** — real, correct, unprompted reasoning about both
the mechanism (fail-open default, environment scoping) and its product consequences,
demonstrated across two separate tasks the same day, not a single lucky answer.
**depends-on:** [[rls-service-role-bypass]]

## experience-immersion-over-instrumentation
**Status:** practicing — 2026-07-27
Refugio's design brief (`[[never-presume-visitor-emotional-state]]`) isn't only a copy-level
rule — it also rules out meta-UI that signals to the visitor "you are being observed or
evaluated" during the ritual, even well-intentioned instrumentation like an in-app feedback
button. Anything that breaks the fourth wall this way changes what people are willing to
write, contaminating the exact authenticity the flow depends on.
**Evidence:** when offered a Supabase-backed in-flow feedback form (the "boring, consistent
with the rest of the stack" choice), pushed back unprompted: *"desde el principio comienza a
decirle al usuario, oh, estamos evaluando, así que ten cuidado con lo que respondes."*
Independently extended a principle previously only seen applied to screen copy
([[never-presume-visitor-emotional-state]]) to a feature-level product decision, without
being pointed at the connection. Landed on 1:1 personal conversations, entirely outside the
app, as the actual feedback channel instead.
**depends-on:** [[never-presume-visitor-emotional-state]]

## ritualized-loading-ux
**Status:** practicing — 2026-07-25
The `Searching` screen (and Observe's arrival transition, same pattern) exists to turn
OpenAI's response latency into something that feels intentional rather than like a stalled
UI — "la latencia técnica se vuelve ritual" per the code's own comment.
**Evidence:** Q4 free recall matched the code's intent precisely, unprompted: "the
justification is the time waiting a response from OpenAI... show something to the user
tha don't feel like low latency."
**Downgraded 2026-07-25, review after 9 days away — evidence corrected same session:**
the review question itself named both `Searching` and "the arrival transition to
Observe" in one breath, inviting exactly the screen-mix-up that followed (answered about
Observe's O(n²) pairwise-similarity fetch when asked about `Searching`) — that specific
confusion is on the question, not a real gap, and was called out, unprompted, the moment
it was noticed. What *is* real, independent of the bad question: reframed the cause as
generic "response construction time" rather than the specific, load-bearing point — that
the delay is real third-party (OpenAI) latency outside the app's control, which is
exactly why it needs to be ritualized rather than optimized away. Refreshed in chat.
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
**Status:** understood — 2026-07-23
User-submitted phrases used to activate automatically the moment OpenAI's moderation
verdict came back clean — no human approved before publish; `/admin/phrases` was an
after-the-fact audit/override layer, not a pre-publish gate. **Turned into a real gate
2026-07-22** (Section 3, Task 3): `finalizeUserPhraseModeration` no longer calls
`setPhraseActive`. It still writes the AI's verdict to `moderation_status`, but nothing
goes live until a human explicitly clicks "Activar"/"Aprobar" in `/admin/phrases` — the
existing UI already supported that state (verified Task 1), so this was a pure removal,
no new admin logic.
**Evidence:** correctly identified, unprompted, both the line to remove
(`setPhraseActive(id, true)`) and — when asked to think further — that the surrounding
`if (!shouldActivatePhrase(status)) return;`/`try`/`catch` became entirely dead code
once that call was gone, not just that one line. Also correctly named which part of the
function's own comment stopped being true ("no human gate before publish"), and iterated
through two more passes to fix a stale leftover reference to `setPhraseActive` and the
now-false "grows organically" framing — each one caught by asking a pointed question,
not handed the answer.
**Same-day extension, Task 4:** applied the concept again outside code, to
`/admin/phrases`'s own UI copy — correctly proposed replacing "herramienta de auditoría"
with framing centered on "antes de que forme parte del corpus" on the first attempt at
the underlying idea, though the first draft left the old "auditoría" label sitting next
to the new "before" language, an internal contradiction (audit = after-the-fact) caught
on the second pass once asked to think about it the same way as the code comment fix
earlier today.
**Upgraded to understood 2026-07-23**, a day after first introduced — real end-to-end
proof (Task 6), not same-day performance. Re-read `setPhraseActive` independently and
correctly predicted, unprompted and in precise detail, exactly what would happen on
clicking "Activar": it checks for an existing embedding, calls the real `getEmbedding`
against OpenAI if missing, only then flips `active`. Verified live against the real
Supabase project (test data cleaned up after): a Contribute submission came back
`moderation_status: "approved"`, `active: false`, `embedding: null` — then, after
clicking "Activar," `active: true` with a real populated embedding vector.
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
**Status:** practicing — downgraded 2026-07-29 (review)
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
**Upgraded to understood 2026-07-22**, two days after first introduced — a real gap
between introduction and this evidence, not same-day performance. Section 3 Task 1
(`20260722120000_add_phrases_origin_column.sql`) written almost independently: correctly
reasoned unprompted that `origin` should be nullable (not `NOT NULL DEFAULT` like
`language`) because seed phrases have no valid value to backfill with, matched the
existing `source` column's `check (... in (...))` style without being shown it directly
(just pointed at the file), and correctly predicted that all 50 existing rows would come
back `null` after the reset — including the non-obvious extra point, unprompted, that
already-submitted real phrases would also permanently lose their origin, not just seed
data. One real syntax slip along the way, self-corrected — see
[[postgres-add-column-not-null-default]].
**Reviewed 2026-07-29 (7 days later) — struggled:** asked why migrations always get their
own branch/PR. Answer captured real but generic reasoning (isolate risk, avoid breaking an
existing flow, tests catch problems) but missed the specific, load-bearing mechanism: that
`deploy-migrations.yml` pushes any `supabase/migrations/**` change straight to the real
production database the instant it merges to `master`, with no pause to coordinate with
app-code deploys — that's the actual reason bundling is dangerous here, not migrations
being risky in the abstract. Downgraded from `understood` to `practicing`; refreshed in
chat, not yet re-tested.
**depends-on:** none

## postgres-function-signature-change-requires-drop
**Status:** practicing — last-reviewed 2026-07-27
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

**Reviewed 2026-07-27 (7 days later):** passed — correctly explained the mechanism
unprompted (function identity is name + argument types, not name alone; defaults create
ambiguity). Also asked, on their own initiative, whether the old overload had actually
been cleaned up — didn't assume either way, asked to verify against the real migration
file before moving on.

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
**2026-07-23:** correctly articulated, unprompted, why `phrases.origin`'s `check`
constraint needed its own new integration file rather than folding into
`match-phrase.integration.test.ts` — "estamos cubriendo un tema que no se ha cubierto
antes" — a real Postgres constraint no mocked test can prove, distinct from
`match_phrase`'s similarity concern even though both are "just database." Briefly
wavered toward a weaker criterion ("touches DB, not business logic") before
self-correcting back to the project's actual file-per-concern convention once asked to
compare against it directly.
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
**Extended 2026-07-22:** the nullable case, not just the `NOT NULL DEFAULT` case. First
wrote `add column origin text nullable check(...)` — `nullable` isn't a real Postgres
keyword (omitting `NOT NULL` already means nullable; there's nothing to say). Asked to
predict what `supabase db reset` would do with that line before running it, correctly
reasoned Postgres wouldn't recognize the word, and fixed it to the real (if redundant)
explicit keyword, `NULL`. Confirmed live: schema applied clean, `\d phrases` showed no
`not null` marker.
**2026-07-25:** applied the `NULL` keyword correctly and immediately for `entries.outcome`,
no repeat of the `nullable` mistake. More significantly, reasoned through *why* it needed
to be nullable at two distinct levels once prompted: first landed on the historical-data
angle alone (can't safely backfill old rows), then — asked to think about *new* rows too —
correctly traced through `submitEntry`'s actual code order and named the real
architectural reason: `insertEntry` runs before `findClosestPhrase` on the "proceed" path,
so even brand-new rows don't have a `matched`/`no_match` verdict available at insert time.
**depends-on:** [[supabase-migrations-workflow]]

## integration-tests-real-postgres
**Status:** practicing — 2026-07-21
The current branch's own work: `vitest.integration.config.ts` +
`scripts/run-integration-tests.sh` run a subset of tests against a real local Postgres
(via Supabase CLI) rather than mocks, specifically for DB-adjacent logic like
`match_phrase` and the daily-spend RPCs.
**Evidence:** authored `src/test/integration/submit-entry.integration.test.ts` end to end
(Section 2, final task) — the real insert/select-id/cleanup pattern, wiring
`moderateTextMock`/`getEmbeddingMock` while deliberately leaving `findClosestPhrase`
unmocked, and correctly predicted the full `npm run test:integration` flow (Docker up →
migrations → mocked-OpenAI-cost-avoidance → real RPC assertions) before running it,
unprompted, in the chat. Then debugged a real failure this suite surfaced — see
[[vitest-file-parallelism-shared-db-race]] and [[supabase-start-vs-reset-stale-state]].
**Extended 2026-07-23, Section 3 Task 7:** authored a new integration file
(`phrases-origin.integration.test.ts`) for the real `check` constraint on
`phrases.origin` — a case a mocked test structurally cannot prove. Two real bugs along
the way, both self-corrected without being handed the fix: confused `source` (only
`'seed'`/`'user'`) with `origin`, putting `"contribute"` in the wrong column; then,
after fixing the `.select()` to also request `origin`, dropped `.single()`, and
correctly diagnosed the resulting `undefined` from the real Vitest failure output —
"la query me estaba devolviendo... una lista de objetos, en lugar de una sola
instancia" — unprompted, reading the actual error rather than guessing.
**depends-on:** [[supabase-migrations-workflow]]

## typescript-discriminated-union-narrowing
**Status:** practicing — 2026-07-21
A TypeScript union distinguished by a shared field (e.g. `EntryOutcome`'s `type`) only
lets you access a field that belongs to one specific branch (like `phrase` on the
`"matched"` branch) after a real runtime check narrows it — `if (outcome.type !==
"matched") throw ...`. A test assertion like `expect(outcome.type).toBe("matched")` does
not narrow the type for TypeScript; only an actual `if`/type-guard in the code does.
**Evidence:** had no prior exposure ("no se typescript"), explained from scratch in chat
with the `EntryOutcome` union definition as the concrete example. Applied it correctly on
the very next save — wrote the `if (outcome.type !== "matched") throw new Error(...)`
guard followed by `outcome.phrase.text`, with no further correction needed.
**depends-on:** none

## vitest-file-parallelism-shared-db-race
**Status:** practicing — 2026-07-21
Vitest runs different test *files* concurrently by default (`fileParallelism: true`).
Harmless for a fully-mocked unit suite, but this project's integration suite has every
file write to the same real local Postgres — two files using overlapping fixture data
(the same frozen embedding from `real-phrase-embeddings.ts`) can collide mid-run: one
file's row is momentarily visible while another file's test asserts against the same
data. Setting `fileParallelism: false` in `vitest.integration.config.ts` forces
integration files to run one at a time, trading linear (not parallel) suite runtime for
removing the race entirely.
**Evidence:** first hypothesis was wrong (assumed our own `afterEach` cleanup "forgot" to
remove the phrase) — correctly abandoned it after being asked whether that could really
be the cause given `afterEach` runs after every test. Then correctly identified,
unprompted, that `vitest.integration.config.ts` had no setting forcing sequential file
execution. Pushed back with a sharp, well-reasoned question about the runtime cost of
`fileParallelism: false` as the suite grows, then independently designed and ran the
falsifying experiment (revert the setting, force a clean `db reset`, rerun) that is what
actually separated this bug from [[supabase-start-vs-reset-stale-state]] — a real, novel
race reproduced on demonstrably fresh data (a new UUID each time), not stale rows.
**depends-on:** [[integration-tests-real-postgres]]

## supabase-start-vs-reset-stale-state
**Status:** practicing — 2026-07-21
`npx supabase start` reuses an existing local Docker volume if one is already present,
rather than recreating the database and reapplying every migration fresh — despite
`run-integration-tests.sh`'s own comment claiming migrations apply "automatic on start."
Only `npx supabase db reset` forces a genuinely clean rebuild. GitHub Actions runners
start with no pre-existing volume, so this is believed to be a local-only footgun, not
necessarily a CI bug — deliberately left unpatched in the script pending real CI
evidence.
**Evidence:** originally surfaced and explained in an earlier session
(2026-07-21, migration-editing work). Recalled correctly, unprompted, across a session
boundary today when a second, unrelated symptom appeared (an identical row UUID
persisting across independent `supabase start` cycles) — correctly connected it back to
the "local DB is running an older/cached state" mechanism without being told the
answer, and correctly named the CI-vs-local distinction from memory.
**depends-on:** none

## flaky-test-concept
**Status:** introduced — 2026-07-21
A test whose outcome depends on a non-deterministic factor (timing, execution order,
concurrent access to shared state) rather than solely on the correctness of the code
under test — the same code and data can pass or fail across separate runs depending on
whether the race actually gets hit.
**Evidence:** named the concept themselves, unprompted, immediately after watching the
file-parallelism race reproduce three times in a row ("esto se convierte en un test
inestable?"). Needed one clarifying nuance (that it manifested as consistently failing
here, not alternating, purely because the suite is small/fast enough that the race
window is almost always hit) rather than a from-scratch explanation.
**depends-on:** [[vitest-file-parallelism-shared-db-race]]

## browser-global-identifier-shadowing
**Status:** practicing — 2026-07-22
An unqualified identifier that's never declared locally still resolves — JavaScript
walks up the scope chain to the global object. `origin` is a real browser global
(`window.origin`, the page's own URL origin), so `{ text, origin, ... }` (object
shorthand) silently picks up the page's URL instead of throwing a `ReferenceError` or
being `undefined` — no compiler or type error either, since `origin` is a legitimately
typed global in `lib.dom.d.ts`. Declaring a same-named local variable/const shadows the
global from that point on, which fixes the bug but is confusing style — better to avoid
the shared name entirely (`origin: LEAVE_A_TRACE_ORIGIN` explicit key, not shorthand).
**Evidence:** predicted `undefined` when asked what `{ ..., origin }` would actually
send, given `origin` was never declared — wrong prediction, corrected by checking
`origin` directly in the browser devtools console themselves and reporting back what it
actually returned ("el host del sitio"). First fix attempt (`const origin =
LEAVE_A_TRACE_ORIGIN`) technically worked via shadowing without being told to do that,
then simplified to the clearer explicit-key form once the readability tradeoff was
pointed out.
**depends-on:** none

## typescript-narrowing-recognized-patterns
**Status:** introduced — 2026-07-22
TypeScript's control-flow analysis only narrows a variable's type after specific
recognized checks — `typeof`, `instanceof`, equality against a literal, or a
user-defined type predicate (`x is Foo`). A generic runtime check like
`someArray.includes(x)` on a widened `string[]` isn't one of those patterns — the
compiler can't "see inside" an arbitrary function call, so `x` stays typed as `string`
even immediately after a validation check that, at runtime, guarantees a narrower type.
The practical fix once you've already validated by hand: an explicit type assertion
(`x as PhraseOrigin`) — honest, not a lie to the compiler, because the validation above
it already proved the narrower type at runtime.
**Evidence:** asked to predict why TypeScript still complained about `origin` on
`submitUserPhrase(text, origin)` two lines after a runtime `.includes()` check already
validated it — connecting it to the discriminated-union narrowing seen the week before.
Responded "revisa" rather than reasoning through it, so this was explained, not derived —
seed-level exposure, not yet demonstrated understanding.
**depends-on:** [[typescript-discriminated-union-narrowing]]

## vitest-mock-queue-leakage
**Status:** introduced — 2026-07-22
`vi.clearAllMocks()` (run in this file's `afterEach`) clears each mock's *call history*
(`mock.calls`, `mock.results`) but does **not** clear queued one-time return values set
via `mockResolvedValueOnce`/`mockImplementationOnce` — those stay queued until something
actually consumes them. When `finalizeUserPhraseModeration` stopped making a second
Supabase call (the removed activation step), tests that queued a *second*
`eqMock.mockResolvedValueOnce(...)` for that now-nonexistent call left it sitting
unconsumed — and it got silently consumed by the *next* test's first real call instead,
making unrelated tests (`approvePhrase`, `rejectPhrase`, `setPhraseActive` — functions
nobody touched) fail with confusing mismatches. `vi.resetAllMocks()` would additionally
clear queued implementations; `clearAllMocks()` does not.
**Evidence:** this was explained, not derived — after Task 3's code change broke 9
tests, most in functions untouched by the change, walked through the mock-queue
mechanism together. The learner correctly executed the resulting fixes across multiple
tests once the specific leftover queue was pointed out each time (deleting an obsolete
test independently identified as redundant with existing `setPhraseActive` coverage —
real initiative — but the underlying *why nine unrelated tests broke* mechanism itself
was told, not discovered).
**depends-on:** none

## local-dev-shared-supabase-env
**Status:** introduced — 2026-07-23
`npm run dev`, run plainly with no environment override, reads `.env.local`'s
`NEXT_PUBLIC_SUPABASE_URL` — which points at the real, shared Supabase project (same one
`preview`/`master` use), not a local database. Only `scripts/run-integration-tests.sh`
overrides this to point at the local Docker Postgres from `supabase start`. So testing a
feature manually via `npm run dev` writes real rows to the shared project, same as the
D12 crisis-flow manual verification did — a known, established practice (clean up test
rows after), not a new discovery, just re-surfaced today by an actual local `db reset`
+ dev-server test writing to the wrong place.
**Evidence:** this was caught and explained by the assistant, not derived independently —
was told plainly what happened and why. What is real evidence: the follow-up judgment
call was sound — agreed to continue since the site is closed to the public (`site_public`
off, low real risk), gave explicit confirmation right before the cleanup delete rather
than assuming it was already authorized, and proposed the correct long-term fix (make
local dev actually point at local Postgres by default) as a new backlog item rather than
trying to solve it mid-task.
**depends-on:** none

## sql-update-without-where-is-dangerous
**Status:** practicing — 2026-07-25
A `.update({...})` call with no `.eq(...)` (or other filter) doesn't update "the current
row" by default — Postgres/PostgREST has no concept of "current row" outside a filter.
It updates *every* row the query would otherwise match, which for an unfiltered call on
`entries` means the whole table. Worse, if the update payload also includes the primary
key (`id`) instead of using it purely as the filter, every row would be set to the same
`id` value, which the primary-key uniqueness constraint would reject on the second row —
a real, safety-relevant bug class, not a style nitpick, especially in a codebase that
writes to a shared production database.
**Evidence:** first draft of `updateEntryOutcome` had exactly this bug —
`.update({ id: id, outcome: outcome })` with no `.eq()` at all. Didn't self-diagnose when
asked "¿contra qué filas se va a aplicar ese update?" — needed the mechanism explained in
full before fixing it. Once explained, correctly applied the fix (added `.eq("id", id)`,
moved `id` out of the update payload) on the first attempt. The diagnosis itself was
told, not derived — worth a real review next time this pattern comes up, to see if it's
internalized independently.
**Confirmed working 2026-07-27:** end-to-end proof against the real Supabase project
showed the fixed `updateEntryOutcome` correctly targeting only the intended row —
submitted three real entries through `/write` (crisis, matched, no_match), and each
row's `outcome` landed correctly without disturbing any other row.
**Applied to a new file, same day:** asked to evaluate `responses.ts`'s `setWantsReply`
update against this same concept, initially misremembered which past bug the question
referred to (confused it with `browser-global-identifier-shadowing`'s `origin` constants)
but, once redirected to the right example, correctly judged the update safe because of the
`.eq("entry_id", entryId)` filter — the right verdict, reasoning supplied after a nudge
rather than recalled unprompted.
**depends-on:** none

## never-presume-visitor-emotional-state
**Status:** practicing — 2026-07-27
The actual design principle behind Refugio/Safe-Mode's screens (from the real design
brief, `project_refugio_design_brief` — not a summary or a guess): *"never have the app
claim or presume the visitor's own emotional state (that's persuasion, not permission) —
only show evidence of someone else's authenticity, unaddressed, and let the visitor draw
their own conclusion privately."* Established precedent: `"you're not the only one who
feels this"` (presumes the visitor's state) was rejected in favor of `"someone decided
not to hide this"` (stays on the other person's side, evidence not persuasion).
**Evidence:** an external agent's analysis of `gratitude/page.tsx`'s "The circle closes."
tagline was independently verified against the real source material (not taken on
faith), which surfaced the actual principle in full. Applied it correctly, unprompted,
to catch a *second*, subtler instance in the same screen that the assistant had judged
fine — the subcopy ("your presence is already a light for someone who hasn't arrived
yet") previewed Leave a Trace's own reveal before that screen got to make it: "no me
gusta el subcopy, parece ser más cuerpo de leave a trace, analizalo." Correct catch,
independent of being told.
**Same-day extension, Mirror screen:** after a guided tour of the previously-parked
`mirror/page.tsx`, asked to evaluate line 81 (`"You're not the first person who felt
this."`) against the principle unprompted (not told which line to look at) and correctly
judged it presumes the visitor's state ("creo que hasta cierto punto presume un poco, y
no deberíamos hacerlo") — the line turned out to be a near-verbatim replay of the brief's
own already-rejected example. When asked to review the rest of the screen's copy (tagline,
no-match lines, button label) line by line, needed the analysis done for them ("dame
ideas... estoy un poco bloqueado") but confirmed the reasoning was sound once presented,
correctly distinguishing the two real violations from the four lines that already respect
the principle. Partial independent application (found the first, most important instance
unprompted) plus confirmed reasoning on the rest — not full independent derivation the
second time.
**depends-on:** none

## observe-tooltip-completeness
**Status:** practicing — 2026-07-28
Observe's hover tooltip runs every phrase through `truncate(text, TOOLTIP_MAX_LENGTH)`
(`observe-canvas.tsx`) before showing it. The constant was raised from 60 to 150 (seed
phrases run up to ~94 chars, user submissions cap at 120) because the old value cut most
real phrases off mid-thought with "…" — working directly against Observe's purpose: the
screen exists to show someone else's words complete and unaddressed, so the visitor can
draw their own conclusion. A truncated phrase is a distorted one, not just a shorter one.
**Evidence:** this fix predates learning-doc tracking (made and merged as PR #119 during
an earlier, abandoned attempt at using the altitude skill) — no original evidence exists.
Closed the gap 2026-07-28: read `truncate()` and its call site cold, then explained
unprompted, in own words, both the mechanical effect (phrases were getting cut off) and
why it mattered specifically for Observe ("complete phrases is a must to show what other
people think... at the end, they are watching someone else['s] reality") — connects to
the same evidence-not-distortion spirit as [[never-presume-visitor-emotional-state]],
independently drawn, not pointed at.
**depends-on:** none

## supabase-autogrant-deprecation
**Status:** introduced — 2026-07-29
Hosted Supabase projects (like this project's real one) still auto-`GRANT`
`SELECT/INSERT/UPDATE/DELETE` to `anon`/`authenticated`/`service_role` on every
`CREATE TABLE` — legacy behavior, mandatory to remove for all projects (new tables)
starting 2026-10-30. A fresh local Supabase CLI database already behaves the new way (no
auto-grant), which is why both `run-integration-tests.sh` and `dev-local-setup.sh` run an
explicit manual `GRANT` after `supabase start` — without it, local Postgres would reject
even a schema-correct query with `permission denied for table ...`.
**Evidence:** asked why the manual `GRANT` step in `dev-local-setup.sh` matters given the
2026-10-30 deadline already known from project memory. Correctly recalled the deadline,
that it's security-motivated, that it's a gradual/transitional rollout, and that this is
why it must be done by hand locally. Real gap: asserted, unprompted and with real
specificity ("después de que anteriormente ya sufrieron infiltraciones en su sistema"),
that the change was triggered by a specific past security breach — not supported by
anything in the documented source (Supabase's own changelog, saved in project memory,
frames it as no-longer-auto-exposing-tables-to-the-Data/GraphQL-API-by-default, not a
breach response). Not corrected by them; flagged directly rather than accepted at face
value.
**depends-on:** [[supabase-migrations-workflow]]

## evidence-based-deferral
**Status:** practicing — 2026-07-29
Don't build (or even decide) for a hypothetical need — wait for real signal to exist first,
then decide with data instead of assumption. First applied in Section 4 (completion-rate
tracking descoped because ~10 interviews would give better signal than a percentage from
10 people), but not named as its own recurring pattern until today.
**Evidence:** in Section 6's D15 resolution conversation, correctly distinguished match rate
(pipeline health) from an emotional-impact signal unprompted, then — when asked whether the
D18-19 interviews already covered the resulting gap the way Section 4 assumed they would for
completion rate — answered honestly that only 1 of 5 planned interviews had actually happened,
which changed the answer. Independently chose (declining a multiple-choice prompt in favor of
a plain-chat answer) to pause the *decision itself*, not just the build, until more real
interviews/feedback exist — correctly recognizing this as the same underlying principle as
Section 4's descope, applied to a new, non-identical situation rather than pattern-matched
reflexively.
**depends-on:** none

## Missing/absent practices
None load-bearing found missing — git history is deep and disciplined (141 commits,
branch-per-concern), CI gates lint/typecheck/test/build on both `master` and `preview`,
env vars are separated via `.env.local`/`.env.example`, and both unit and integration
tests exist. The gap here isn't process, it's that none of it has been explained by the
person who owns the project yet — that's what the sections in `plan.md` are for.

# Bilingual local QA — 2026-09-19

Branch: `test/i18n-bilingual-qa`, based on `515d1ab` (PR #190).
Tracking: GitHub issue #178. Status: live moderation batch and the local journey checks listed below passed. The founder has since completed final live review and closed issue #178 (see closure below).

## Completed without live provider calls

- 298 unit tests, ESLint and TypeScript passed in an isolated copy of tracked source.
- 23 integration tests passed against local Supabase with simulated OpenAI responses.
- Six new integration cases cover Spanish and English independently: crisis, a self-harm score above the application threshold with provider `flagged=false`, and a general flag without self-harm.
- They verify outcome persistence, absence of embeddings and response records for flagged entries, isolation of crisis text in `crisis_entries`, and absence of crisis records for general flags. Temporary entries are removed after testing.
- Existing integration coverage verifies that English and Spanish entries match their own language even when candidate embeddings are identical.
- Chrome loaded Home, Arrive, Remember, Write, Observe, Gratitude, Leave a Trace and Contribute in both languages (16 loads). Each returned HTTP 200 with the expected document language and selected language control.
- Drafts survived ES → EN → ES in Write, Leave a Trace and Contribute.
- Browser requests outside localhost and all non-GET requests were blocked for this walkthrough. No forms were submitted and no live OpenAI calls were made.
- Home's introductory dialog temporarily hides background controls from the accessibility tree; the initial selector lookup timeout was a test assumption, not a confirmed application failure.

## Authorized live batch

The founder explicitly approved six moderation requests and at most two embedding requests. A localhost proxy enforced endpoint/count limits and rejected retries; SDK retries were disabled in the temporary preview only. The application submitted all six inputs through the real Write UI and wrote only to local Supabase.

| Language | Synthetic case | Observed outcome | UI and local storage |
| --- | --- | --- | --- |
| es | Explicit self-harm crisis | crisis | Localized help; entry text isolated in crisis_entries; no embedding or response |
| es | Threat of violence against another person | general_flagged | Localized rejection; no crisis record, embedding, or response |
| es | Self-acceptance reflection | matched | Matched Spanish phrase; response row and outcome persisted |
| en | Explicit self-harm crisis | crisis | Localized help; entry text isolated in crisis_entries; no embedding or response |
| en | Threat of violence against another person | general_flagged | Localized rejection; no crisis record, embedding, or response |
| en | Self-acceptance reflection | no_match | Correct no-match flow; response row and outcome persisted |

- Actual provider requests: **6 moderation + 2 embedding**, all HTTP 200, no retries. Embedding usage returned by the provider: **39 total tokens**. This is usage evidence, not a billing statement.
- Both clean journeys reached Mirror → Gratitude → Leave a Trace and used the skip option. No phrase submissions or classification requests were made.
- All six temporary entries were removed; related response/crisis rows cascade on deletion.
- Read-only comparison of the Observe endpoint with local database IDs passed: 48 Spanish active embedded phrases, zero English. English no-match is expected in this local dataset. English positive matching remains covered by integration fixtures, not this live batch.
- Production build passed using placeholder credentials. Redis credentials are absent in this local setup, so its fail-open behavior was exercised; rate limiting was not validated end to end.
- Provider proxy stopped after the batch. Temporary SDK changes were restored. The preview retains a placeholder OpenAI key.

## Local journey follow-up — 2026-09-19 (America/Merida)

Branch: `test/complete-local-bilingual-qa`, based on `df2da9a`. Chrome exercised the local preview on port 3001 against local Supabase. Runtime source and messages matched this revision; the isolated preview's integration test file differed, but was not executed in this walkthrough.

- Loaded six English fixture phrases with their existing 1536-dimensional embeddings, approved and active, with distinct dates within the previous 30 days. These six remain available locally.
- After restarting Supabase from its local backup, there were no active Spanish candidates. A temporary Spanish phrase reused an English fixture vector to make language filtering deterministic. This checks application behavior, not Spanish embedding quality; the temporary phrase was deleted afterward.
- In both languages, submitted Write through the browser and verified a positive match to the expected same-language phrase, then continued through Mirror → Gratitude → Leave a Trace.
- Toggled Mirror's connect action on → off → on and checked each persisted `responses.wants_reply` value. Resonance persisted once, disabled its button, and remained selected alongside connect after switching to the other language and back.
- Submitted Leave a Trace and Contribute in both languages. Each submission returned HTTP 200 and persisted the correct language and origin. Simulated moderation approved the phrases; they remained inactive without embeddings, as expected before admin activation.
- After switching language and back, Leave a Trace retained its completed screen without reopening the form; Contribute retained its saved confirmation and empty input.
- Observe loaded its canvas and received the expected local corpus through its API: six English phrases and one temporary Spanish phrase during the test.
- The successful batch used **six simulated moderation responses and two simulated embedding responses**, with zero unexpected provider endpoints. The localhost stub had no upstream forwarding and reported zero token usage. No real OpenAI requests were made.
- An initial stub-format failure was corrected: the SDK requested base64 embeddings, so the stub needed to return base64 rather than a numeric array. This was a QA harness issue, not an application change.
- Temporary entries, submitted phrases, the Spanish candidate and resonance rows were removed. Local feature flags and the preview environment were restored; the stub stopped. The six seeded English phrases remain.

## Live Redis follow-up — 2026-09-22 (America/Merida)

- Confirmed development environment loading with the installed Next.js `@next/env` loader: `.env.development.local` supplies local Supabase settings and `.env.local` supplies Redis credentials. No credentials needed duplicating or changing. The earlier isolated preview's missing Redis configuration does not describe this workspace's current configuration.
- Authenticated against real Upstash Redis and received `PONG`. The sandboxed connection attempt failed; the approved network-enabled rerun passed.
- Exercised the actual `rateLimitGuard` with unique synthetic identifiers: ten calls allowed and the eleventh returned a Response with status 429 and `{ "error": "too many requests" }`. Verified IP limits with a different session per call and session limits with a different IP per call.
- Exercised the actual resonance limiter: fourteen calls allowed, fifteenth blocked. The same identifiers could still use the independent entries budget.
- No Redis exceptions or fail-open paths occurred in the successful run. Test counters expire automatically. No Supabase or OpenAI calls were made; no credentials were printed.
- All 37 focused unit tests passed across the limiters, submission guards, entries, phrases and resonance routes. Command: `npm test -- --exclude '.claude/**' src/lib/rate-limit.test.ts src/lib/public-submission-guards.test.ts src/app/api/entries/route.test.ts src/app/api/phrases/route.test.ts 'src/app/api/phrases/[id]/resonate/route.test.ts'`. An initial run also discovered a nested project copy under `.claude/` and failed on that copy; the scoped rerun excluded it.
- Scope: real Redis plus application limiter/guard execution, and mocked route unit tests. This did not exercise HTTP through a running Next.js server, proxy IP extraction, browser cookies, window recovery, or production deployment.

## Rollout closure — 2026-09-22

The founder reported completing final live review and updating issue #178. The issue is closed with all delivery items checked, including final rollout verification. PR #194, containing the local journey and Redis follow-ups, is merged to `master`. This is founder-reported rollout acceptance, not an additional production test performed by the local QA harness.

## Evidence limits and follow-up coverage

- Local test results above retain their original scope; founder rollout acceptance is recorded separately above.
- These six samples validate observed model behavior, not broad moderation accuracy or calibration.
- The September 19 follow-up uses deterministic provider responses; it adds application-flow coverage, not live model accuracy evidence. The September 22 follow-up validates real Redis limits at the application guard level; full HTTP/browser rate-limit coverage remains unverified.
- Any additional provider calls need a new explicit approval. Any production Supabase access (including reads) also needs approval. The local batch alone did not close the rollout gate; closure also required the founder’s final live review.

Production Supabase was not accessed during this QA task.

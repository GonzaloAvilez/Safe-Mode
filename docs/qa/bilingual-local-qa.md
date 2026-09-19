# Bilingual local QA — 2026-09-19

Branch: `test/i18n-bilingual-qa`, based on `515d1ab` (PR #190).
Tracking: GitHub issue #178. Status: live moderation batch passed; remaining full-journey coverage is listed below.

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

## Remaining before closing the full QA gate

- Exercise positive English matching and a nonempty English Observe constellation through the UI; the current local English corpus has no active embedded phrases.
- Validate submitted Leave a Trace / Contribute outcomes, Mirror response actions and state preservation after submissions. Draft preservation and the skip journey have passed, but they are not substitutes for submission coverage.
- These six samples validate observed model behavior, not broad moderation accuracy or calibration.
- Any additional provider calls need a new explicit approval. Any production Supabase access (including reads) also needs approval. Do not mark the whole bilingual QA item complete based solely on this batch.

Production Supabase was not accessed during this QA task.

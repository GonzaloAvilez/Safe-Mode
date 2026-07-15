# Roadmap

Status tracker for Safe-Mode, following the original 4-week workshop plan (D1–D30).

**Status:** `[x]` merged to `master` (production) · `[~]` built, merged to `preview` (staging) but not yet in `master` · `[ ]` not started.

The real UX evolved past the original day-by-day spec in places — see "Added scope" and "Deviations" below. This file tracks both the official D-items and where the actual build diverged from them.

## Week 1 — Getting started right ✅ complete

- [x] **D1-2 Setup** — Repo + Vercel + GitHub. Next.js, Tailwind, shadcn/ui. Empty deploy live.
- [x] **D3 Setup** — Supabase + pgvector. Postgres, vector extension, `entries` table, cosine RPC function.
- [x] **D4 AI/Safety** — OpenAI embeddings + Moderation API (conservative threshold) + $5/day hard spend cap.
- [x] **D5-6 Build** — Core end-to-end flow: text → moderation → embedding → match (`POST /api/entries`).
- [x] **D7 Build** — 50 seed phrases with embeddings, wide emotional diversity (`scripts/seed-phrases.ts`).

**Post-hoc fix to D3 (2026-07-11):** `match_phrase` had no minimum-similarity floor — it always returned the single nearest phrase regardless of how far away it actually was. Confirmed empirically: nonsense input ("test foo") matched a real phrase at similarity 0.077. Fixed by requiring similarity > 0.5 (same threshold already used by Observe's canvas, empirically ~p90 of the real corpus's own pairwise similarity distribution). Branch `week1/match-phrase-similarity-threshold`, merged to `master` via PR #33.

## Issue #20 — Security hardening pass ✅ complete

- [x] **P0** — RLS enabled deny-by-default on all tables; `server-only` guard on the Supabase admin client.
- [x] **P1** — Rate limiting on `POST /api/entries` (Upstash, sliding window 10 req/60s) + minimal security logging.
- [x] **P2** — Crisis-flagged text isolated into its own `crisis_entries` table + daily cron anonymizing rows older than 30 days.
- [x] **P3** — Anonymous signed-cookie session (`sm_session`, 24h), wired into rate limiting and `responses.session_id`.

## Week 2 — Get it online ✅ deployed to `master`, closed to the public pending soft launch

**Full promotion 2026-07-14 (PR #55):** everything below is now in `master`/production, not just `preview`. It is not, however, open to the public yet — see the site-visibility flag entry under "Added scope."

- [x] **D8-9 Presence ecosystem** — Observe. Animated canvas, nodes, central pulse, connections.
- [ ] **D10 Generative audio** — Web Audio API soundscape triggered by interaction. Built (generative D Low Pygmy handpan pad, pure synthesis, no samples, plus a per-session mute toggle), but still only on branch `week2/handpan-ambient-audio` (commit `355acc0`) — never merged to `preview` or `master`. The only screen-flow-adjacent D-item still genuinely not shipped anywhere.
- [x] **D11 Writing field + safety text** — Write. 800-char limit; invitation prompt copy added 2026-07-14. Still no visible calm counter (e.g. "245/800") — minor, not blocking.
- [x] **D12 Crisis screen** — outcome state inside Write's result (not a dedicated route), shows `findahelpline.com`. Manually verified end-to-end 2026-07-14, see the non-negotiable checklist below.
- [x] **D13 Mirror screen** — its own screen (`/mirror`): violet "other" node, quote reveals letter-by-letter, "resonó conmigo" toggle. Reached on both `matched` and `no_match`.
- [x] **D14 Public URL + domain** — deployed to `master`/production 2026-07-14 (PR #55). **Deployed ≠ open** — the site-visibility flag (see "Added scope") is intentionally set to `site_public:production = false`, confirmed by hand after the deploy. Opening it to the public is a separate, deliberate decision still to be made (see D26).

**Week 2 deliverable ("app live on the internet, full flow working end to end") is technically met** — the code is live on production. It's deliberately kept closed via the visibility flag rather than actually reachable by the public, pending the language decision and D26 soft-launch planning below. D10 (audio) remains the one unshipped Week 2 item, and it's cosmetic, not blocking.

## Added scope — not in the original 4-week plan

- [x] **Remember screen** — reflective pause between Observe and Write (breathing point, box-breathing cadence). Design addition, sourced from a separate 6-screen design brief (Toy Story 5 / "Refugio"), not the official D-day plan.
- **Feel Safe** — was part of that same richer 6-screen vision, then cut after design review (redundant with what Observe already does — see [[project_refugio_design_brief]]). Never part of the official plan, so cutting it doesn't affect D-day scope.
- [x] **Searching, Mirror, Gratitude — three more screens, discovered 2026-07-12, built 2026-07-13.** Real mockups (`refugio-all-screens.html`, `bocetos_pantallas_05_06_08.html`, `refugio_spec_design_v3.png`) revealed the flow is actually **8 screens**, not 5: Arrive → Observe → Remember → Write → **Searching** → **Mirror** → **Gratitude** → Leave a Trace.
  - **Searching** (`src/app/(experience)/write/_components/searching.tsx`) — not a separate route; a full-screen ritualized loading state (gold sonar rings + orbiting particles) shown while `POST /api/entries` is in flight.
  - **Mirror** (`/mirror`) — violet "other" node, quote reveals letter-by-letter, "resonó conmigo" toggle (persists to `responses.wants_reply`). Reached on `no_match` too, not just `matched` — the node dims rather than the visitor dead-ending in Write. **Still flagged for a follow-up adjustment pass — scope not yet defined.**
  - **Gratitude** (`/gratitude`) — static closing message, densest/warmest ecosystem visual (Arrive's particle pattern + Observe's full multicolor palette), no input. **Also still flagged for a follow-up adjustment pass.**
  - Write itself did *not* get the violet-accent-canvas visual update the same mockups implied — still open if picked back up later.
- [x] **Home (screen 0), built 2026-07-14.** `/` used to be the bare create-next-app boilerplate — now a real screen inside `(experience)`, inheriting the shared dark layout. Sourced from a second ChatGPT design conversation (PDF), arguing Home shouldn't *explain* Refugio but let a visitor *feel* it in a few seconds — same thesis as the Toy Story/Bonnie analysis behind the rest of the flow. Shows real excerpted phrases (≤6 words) from the live `phrases` corpus, fading in and out, instead of description copy. Carries the mandatory rules-disclosure modal (see the non-negotiable checklist).
- [x] **Write/Leave a Trace prompt copy + shared `ScreenPrompt` typography, built 2026-07-14.** Both screens lacked invitation copy above their input. Extracted a shared `ScreenPrompt` component so Arrive, Remember, Write, Gratitude, and Leave a Trace all inherit one typography scale instead of each re-declaring its own.
- [x] **Site-visibility feature flag (maintenance mode), built 2026-07-14.** First flag on a new generic `settings` key-value table (deny-by-default RLS, same as every other table). `site_public`, admin-controlled from the dashboard header, gates every public route in `proxy.ts` — off redirects to `/closed`; `/admin` and `/api/cron` stay reachable regardless. The app-level, Vercel-free-tier-friendly alternative to Vercel's own preview-only password protection, which `master` can't use. **Scoped per environment** (`site_public:production`, `site_public:preview`, `site_public:development`) after finding the naive first version used one global row shared across all three, since they all point at the same Supabase project — closing any one environment would have closed all of them. **`site_public:production` was seeded to `false` directly in Supabase before the D14 promotion**, and confirmed closed by hand afterward — production did not launch open to the public.

## 🔴 Non-negotiable before D26 (soft launch) — all resolved

- [x] **Territory/rules disclosure** — lives as a mandatory modal on Home (screen 0) rather than inline on Arrive (screen 1) as originally specified — a deliberate pivot toward "show evidence, don't explain." **Only holds if `/` stays the one mandatory front door** — a shared link straight to `/arrive` would bypass it. Worth re-checking whenever a public URL actually gets shared with real testers.
- [x] **Crisis screen with findahelpline.com working** — implemented.
- [x] **Moderation API on conservative threshold** — implemented (D4).
- [x] **Manually tested with real risk cases** — resolved 2026-07-14. Walked all three moderation paths through the real `/write` UI (not curl): a self-harm-ideation phrase correctly triggered the crisis flow (findahelpline.com shown, `entries.text` stayed `null`, real text isolated in `crisis_entries` only); a violent-but-non-self-harm phrase correctly triggered the distinct general-flagged message, not crisis; a clean phrase proceeded normally to a Mirror match. Verified at both the UI and database level. Test rows deleted from the shared Supabase project after verification.

## Open decision: language (English vs. Spanish)

The plan specifies English-speaking testers for D18-19 and "in English" for D26 — but all UI copy built so far is in Spanish. Needs a decision before D18: translate the UI, or adjust the testing/soft-launch plan to Spanish-speaking users. **Now the actual gate on opening the site to real testers**, since every other pre-launch item above is resolved.

## Week 3 — Real users (not started)

- [ ] **D15 Before/after scale** — 1-5 question, saved to Supabase. Schema exists (`scale_before`/`scale_after` columns), no UI control on any screen yet.
- [x] **D16 Fake door — reply** — covered, not exactly by original design. Mirror's "resonó conmigo" toggle writes to `responses.wants_reply`, but signals "this resonated with me" rather than the "I want to reply" intent D16 originally specced. Treated as done; revisit only if the distinction turns out to matter for D27-28 metrics.
- [x] **D17 Leave a phrase** — "Leave a Trace", screen 09 of 9 (counting Home), the last in the sequence. `/leave-a-trace`, optional (120 chars, explicit "prefiero no dejar nada" skip), submits via `POST /api/phrases`.
  - **Post-hoc fix:** `finalizeUserPhraseModeration` was activating approved user phrases without ever computing an embedding (`active=true`, `embedding=NULL`), which would have 500'd `/observe` for every visitor the moment the first user phrase got approved. Fixed before shipping: activation only happens in the same write that computes a real embedding. Observe also got a defensive filter dropping any active-but-embedding-less row.
  - **Moderation policy:** OpenAI's verdict alone decides on submit, no human gate before publish — the admin panel is the audit layer instead (approve/reject/activate/deactivate after the fact). Phrases now also check the same conservative self-harm threshold entries use (previously only checked the raw `flagged` boolean), since they publish into the shared public corpus.
- [ ] **D18-19 5 real users** — blocked only on the language decision now (D14 is met).
- [ ] **D20-21 Adjustments from feedback** — depends on D18-19.

## Week 4 — Ship & tell the story (not started)

- [ ] **D22-23 Final polish** — transitions, copy, audio.
- [ ] **D24-25 Expand phrase pool** — 100+ seed phrases.
- [ ] **D26 Soft launch** — 10 people, different countries, no public announcement. **Mechanically ready whenever the language decision resolves** — flip `site_public:production` to `true` via `/admin`, no redeploy needed.
- [ ] **D27-28 Metrics + narrative** — flow completion rate, before/after scale, fake-door clicks.
- [ ] **D29-30 Demo Day prep** — 3-minute pitch.

## Open / deferred

- [x] **CI test suite** — gates PRs on `lint`/`typecheck`/`test`/`build`, for both `master` and `preview` independently (`.github/workflows/ci.yml`).
- [x] **`wants_reply` UI** — resolved via Mirror's "resonó conmigo" toggle (see D16 above on whether it's the *right* control for what this item originally meant). The `scale_before`/`scale_after` half is still tracked under D15 — that part remains unbuilt.
- [~] **Spend-cap-reached UX** — partially resolved: Write's outcome states include this copy ("Ya usamos todo el espacio de hoy, vuelve mañana"), never explicitly tested end-to-end.
- [ ] **Bot/abuse protection** — rate limiting done; honeypot field + submission-timing check still pending (deprioritized, lower urgency while the site stays closed).
- [x] **In-app admin review panel** — `/admin` (password-gated via a signed cookie; protected by `proxy.ts` — Next 16 renamed Middleware to Proxy). Three views: phrase moderation, flagged/crisis entries, daily spend vs. the $5 cap. Built as an **audit tool, not an approval gate**. Supabase Studio is no longer the only fallback, but still useful for anything the panel doesn't cover.
- [ ] **`match_phrase` vector index** — full table scan today, fine at current scale (~50 phrases). Revisit if active phrases approach ~5,000–10,000 rows — see [[project_match_phrase_scaling_tripwire]].
- [ ] **"Volver al inicio" still points to `/arrive`** — Leave a Trace's closing CTA predates Home (screen 0); now that `/` is the real front door, "inicio" arguably means `/`, not `/arrive`. Deferred as a separate small fix.

## Experience flow (Home → Arrive → Observe → Remember → Write → Searching → Mirror → Gratitude → Leave a Trace)

All 9 screens are built and deployed to `master`/production as of 2026-07-14 — **closed to the public via the site-visibility flag, not a code/deploy gap.** See D14 above.

- [x] **Home** — `src/app/(experience)/page.tsx`. Screen 0, added scope, see above.
- [x] **Arrive** — `src/app/(experience)/arrive`.
- [x] **Observe** — `src/app/(experience)/observe`. (Maps to D8-9.)
- [x] **Remember** — `src/app/(experience)/remember`. Added scope, see above.
- [x] **Write** — `src/app/(experience)/write`. (Maps to D11-13.) Still missing the violet-canvas visual update the 2026-07-12 mockups implied — see "Added scope" above.
- [x] **Searching** — `src/app/(experience)/write/_components/searching.tsx`. Not a route, see "Added scope" above.
- [x] **Mirror** — `src/app/(experience)/mirror`. Flagged for a follow-up adjustment pass, scope TBD. (Maps to D13.)
- [x] **Gratitude** — `src/app/(experience)/gratitude`. Flagged for a follow-up adjustment pass, scope TBD.
- [x] **Leave a Trace** — `src/app/(experience)/leave-a-trace`. (Maps to D17.)

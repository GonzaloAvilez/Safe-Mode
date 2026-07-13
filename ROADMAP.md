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

## Week 2 — Get it online (in progress, on `preview`)

- [~] **D8-9 Presence ecosystem** — Observe. Animated canvas, nodes, central pulse, connections. Built, merged to `preview`.
- [ ] **D10 Generative audio** — Web Audio API soundscape triggered by interaction. **Not started — no audio exists anywhere in the codebase.** (The handpan-audio ideas from an earlier ChatGPT conversation never made it into real code.)
- [~] **D11 Writing field + safety text** — Write. 800-char limit exists; no visible calm counter (e.g. "245/800"); no territory/rules notice before the field. Partial.
- [~] **D12 Crisis screen** — exists as an outcome state inside Write's result (not a dedicated screen), shows `findahelpline.com`. Functionally working.
- [~] **D13 Mirror screen** — resolved 2026-07-13. Promoted out of Write's inline "matched" outcome state into its own screen (`/mirror`, screen 06 of 8): violet "other" node, quote reveals letter-by-letter, "resonó conmigo" toggle. Also now reached on `no_match` (not just `matched`) — the node dims instead of disappearing, so the visitor never dead-ends back in Write. Built, merged to `preview` via PR #37.
- [ ] **D14 Public URL + domain** — **nothing is deployed to `master`/production yet.** Deliberate decision (screens stay on `preview` until ready), but this is the official Week 2 deliverable and it isn't met yet. **This is the actual bottleneck now** — the full 8-screen flow is built and merged to `preview` as of 2026-07-13, but none of it exists for a real visitor until this lands.

**Week 2 deliverable ("app live on the internet, full flow working end to end") not yet met** — blocked on D10, D14, and the non-negotiable checklist below. The flow itself is no longer the blocker; getting it in front of anyone is.

## Added scope — not in the original 4-week plan

- [~] **Remember screen** — reflective pause between Observe and Write (breathing point, box-breathing cadence). Your own design addition, sourced from a separate 6-screen design brief (Toy Story 5 / "Refugio"), not from the official D-day plan. Built, merged to `preview`.
- **Feel Safe** — was part of that same richer 6-screen vision, then cut after design review (redundant with what Observe already does — see [[project_refugio_design_brief]]). Was never part of the official plan either, so cutting it doesn't affect D-day scope.
- [~] **Searching, Mirror, Gratitude — three more screens, discovered 2026-07-12, built 2026-07-13.** Real mockups (`refugio-all-screens.html`, `bocetos_pantallas_05_06_08.html`, `refugio_spec_design_v3.png`, all dropped in `~/Downloads` same day — spec image now also at `docs/design/refugio_spec_design_v3.png`, see below) revealed the flow is actually **8 screens**, not 5: Arrive → Observe → Remember → Write → **Searching** → **Mirror** → **Gratitude** → Leave a Trace. All three built and merged to `preview` (PRs #36-38):
  - **Searching** (`src/app/(experience)/write/_components/searching.tsx`) — not a separate route; a full-screen ritualized loading state (gold sonar rings + orbiting particles converging on a pulsing core) shown while the real `POST /api/entries` request is in flight. Mockup's own note: "la latencia técnica se vuelve ritual."
  - **Mirror** (`/mirror`) — promotes D13 from an inline Write outcome state into its own screen: violet "other" node, quote reveals letter-by-letter, "resonó conmigo" toggle (persists to `responses.wants_reply` via `POST /api/entries/[id]/resonate`). Deviated from the original mockup during build: also reached on `no_match`, not just `matched` — the visitor still passes through Mirror with the node dimmed rather than dead-ending in Write. **Flagged by the user for a follow-up adjustment pass — scope not yet defined.**
  - **Gratitude** (`/gratitude`) — static closing message screen ("Gracias por permitirte estar aquí"), densest/warmest ecosystem visual of the flow (reuses Arrive's particle pattern with Observe's full multicolor palette), no input. Reached from Mirror regardless of outcome. **Also flagged by the user for a follow-up adjustment pass — scope not yet defined.**
  - Write itself did *not* get the violet-accent-canvas visual update the same mockups implied — deprioritized, still just a static gradient glow. Open if picked back up later.

## 🔴 Non-negotiable before D26 (soft launch) — current gaps

- [ ] **Territory/rules text visible on screen 1** — not implemented. Arrive has warm welcome copy but no explicit anonymity/rules/"what this is and isn't" disclosure.
- [x] **Crisis screen with findahelpline.com working** — implemented.
- [x] **Moderation API on conservative threshold** — implemented (D4).
- [ ] **Manually tested with real risk cases** — no confirmed record of this specific pass (general moderation was curl-tested; crisis-specific manual testing with real risk language is unconfirmed).

## Open decision: language (English vs. Spanish)

The plan specifies English-speaking testers for D18-19 and "in English" for D26 — but all UI copy built so far is in Spanish. Needs a decision before D18: translate the UI, or adjust the testing/soft-launch plan to Spanish-speaking users.

## Week 3 — Real users (not started)

- [ ] **D15 Before/after scale** — 1-5 question, saved to Supabase. Schema exists (`scale_before`/`scale_after` columns), no UI control on any screen yet.
- [~] **D16 Fake door — reply** — partially covered, not by design. Mirror's "resonó conmigo" toggle (2026-07-13) writes to the same `responses.wants_reply` column this item names, but it signals "this phrase resonated with me," not the "I want to reply" intent D16 originally specced. Worth a decision: treat as done, or still build the originally-intended fake-door reply gesture separately.
- [~] **D17 Leave a phrase** — this is "Leave a Trace", screen 08 of 8, the last in the sequence, after Gratitude. Built 2026-07-13: `/leave-a-trace`, optional (120 chars, explicit "prefiero no dejar nada" skip), reuses Write's textarea/button spec, submits via `POST /api/phrases`. Merged to `preview` via PR #39 — not in `master` yet.
  - **Post-hoc fix, same day:** `finalizeUserPhraseModeration` was activating approved user phrases without ever computing an embedding — `active=true`, `embedding=NULL`. `observe/page.tsx`'s pairwise similarity loop threw on the null, which would have 500'd `/observe` for every visitor the moment the first user phrase got approved. Fixed before this screen shipped: activation now only happens in the same write that also computes and stores a real embedding, gated by the same daily spend cap D4 already enforces for entries. Observe also got a defensive filter dropping any active-but-embedding-less row, in case a manual Supabase Studio edit ever reintroduces the state.
- [ ] **D18-19 5 real users** — blocked on D14 (public URL) and the language decision above.
- [ ] **D20-21 Adjustments from feedback** — depends on D18-19.

## Week 4 — Ship & tell the story (not started)

- [ ] **D22-23 Final polish** — transitions, copy, audio.
- [ ] **D24-25 Expand phrase pool** — 100+ seed phrases.
- [ ] **D26 Soft launch** — 10 people, different countries, no public announcement.
- [ ] **D27-28 Metrics + narrative** — flow completion rate, before/after scale, fake-door clicks.
- [ ] **D29-30 Demo Day prep** — 3-minute pitch.

## Open / deferred

- [ ] **CI test suite** — gate PRs on `test`/`lint`/`build`. Only migrations auto-deploy today.
- [~] **`wants_reply` UI** — resolved 2026-07-13 via Mirror's "resonó conmigo" toggle (on `preview`, not `master`), though see the D16 note above on whether it's the *right* control for what this item originally meant. (The `scale_before`/`scale_after` half of this is still tracked under D15 above — that part remains unbuilt.)
- [~] **Spend-cap-reached UX** — partially resolved: Write's restyled outcome states now include this copy ("Ya usamos todo el espacio de hoy, vuelve mañana"), never explicitly tested end-to-end.
- [ ] **Bot/abuse protection** — rate limiting done; honeypot field + submission-timing check still pending (deprioritized).
- [ ] **In-app admin review panel** — deferred post-MVP; Supabase Studio is the manual-review fallback.
- [ ] **`match_phrase` vector index** — full table scan today, fine at current scale (~50 phrases). Revisit if active phrases approach ~5,000–10,000 rows — see [[project_match_phrase_scaling_tripwire]].

## Experience flow (Arrive → Observe → Remember → Write → Searching → Mirror → Gratitude → Leave a Trace)

All 8 screens now built and merged to `preview` (PRs #29-31, #36-39) — **none deployed to `master`/production yet, see D14.**

- [~] **Arrive** — `src/app/(experience)/arrive` — built, on `preview`.
- [~] **Observe** — `src/app/(experience)/observe` — built, on `preview`. (Maps to D8-9.)
- [~] **Remember** — `src/app/(experience)/remember` — built, on `preview`. Added scope, see above.
- [~] **Write** — `src/app/(experience)/write` — functional + visually redesigned, on `preview`. (Maps to D11-13.) Still missing the violet-canvas visual update the 2026-07-12 mockups implied — see "Added scope" above.
- [~] **Searching** — `src/app/(experience)/write/_components/searching.tsx` — built, on `preview`. Not a route, see "Added scope" above.
- [~] **Mirror** — `src/app/(experience)/mirror` — built, on `preview`. Flagged for a follow-up adjustment pass, scope TBD. (Maps to D13.)
- [~] **Gratitude** — `src/app/(experience)/gratitude` — built, on `preview`. Flagged for a follow-up adjustment pass, scope TBD.
- [~] **Leave a Trace** — `src/app/(experience)/leave-a-trace` — built, on `preview`. (Maps to D17.)

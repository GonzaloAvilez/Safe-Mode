# Screens map

Updated 2026-09-22 for the bilingual experience. This maps current routes and state
ownership; [ROADMAP.md](../ROADMAP.md) tracks delivery and product decisions.

## Routing conventions

Next.js App Router uses the folder tree under `src/app/` rather than a central URL
map. `page.tsx` defines a page; `route.ts` defines an HTTP handler.

- `[locale]` is a dynamic URL segment: public pages use `en` or `es`.
- `(experience)` and `(dashboard)` are organizational route groups, absent from URLs.
- `_components` and `_shared` are private folders, not routes.

```text
src/app/[locale]/(experience)/mirror/page.tsx → /en/mirror or /es/mirror
src/app/[locale]/(experience)/write/page.tsx  → /en/write or /es/write
src/app/admin/login/page.tsx                 → /admin/login
```

`src/i18n/routing.ts` defines the supported locales and required prefixes.
`src/i18n/navigation.ts` supplies locale-aware links/navigation: a component can link
to `/write` while the resulting public URL retains the selected locale. Root and
legacy unprefixed experience URLs negotiate a locale using the saved cookie,
`Accept-Language`, then English. `/admin`, `/closed` and `/api/*` stay unprefixed.
See [ADR-003](./decisions/ADR-003-bilingual-routing-and-matching.md).

`src/proxy.ts` applies admin authentication, visibility flags, locale normalization
and public-page locale routing. Being exempt from the site-visibility flag does not
mean bypassing Proxy: admin routes still require authentication. `/api/phrases*`
and `/api/cron*` are exempt from that visibility gate and retain their own endpoint
controls. When `contribute_open` is enabled, Contribute remains reachable even if the main
site is closed. Otherwise it follows `site_public`; turning `contribute_open` off
alone does not hide Contribute while the main site is open.

A page is a Server Component by default and can fetch server data. Interactive
components use `"use client"` for browser state and event handling; they may still
be prerendered on the server. One route can render multiple states without creating
additional URLs.

## Routes at a glance

Here `{locale}` means `en` or `es`.

| Route | Experience |
| --- | --- |
| `/{locale}` | Home |
| `/{locale}/arrive` | Arrive |
| `/{locale}/observe` | Observe |
| `/{locale}/remember` | Remember |
| `/{locale}/write` | Write, Searching and flagged/error outcomes |
| `/{locale}/mirror` | Matched or no-match result |
| `/{locale}/gratitude` | Gratitude |
| `/{locale}/leave-a-trace` | Optional public contribution and closing state |
| `/{locale}/contribute` | Standalone contribution utility |
| `/admin`, `/admin/login` | Internal dashboard and sign-in |
| `/admin/phrases`, `/admin/flagged`, `/admin/spend`, `/admin/metrics` | Internal review and metrics |
| `/closed` | Maintenance/closed-site page |

The nine experience screens count Searching as a screen, although it shares Write's
route. Contribute is outside that sequence.

## Screen behavior

All relative file paths below are under `src/app/[locale]/(experience)/`.

### Home

`page.tsx` and `_components/home-gate.tsx` implement three stages:

1. Rules acknowledgment (`RulesGate`), recorded as `sm:rulesAcknowledged` in localStorage.
2. The three-part, visitor-paced introduction (`ArrivalIntro`), remembered as
   `sm:arrivalIntroSeen:v3` in localStorage. The visitor can advance or skip it.
3. The regular Home view and entry CTA.

The introduction and fading phrase feed use human-authored phrases from the selected
language. Optional narrative metadata is controlled by its feature flag. Rules and
intro acknowledgments persist per browser; their presence is not evidence that a
visitor understood the experience. Direct links to later screens do not enforce this
Home acknowledgment flow.

### Arrive and Remember

`arrive/page.tsx` renders the arrival canvas and links to Observe.
`remember/page.tsx` renders the breathing pause and links to Write.

### Observe

`observe/page.tsx` delegates to `_components/observe-screen.tsx`:

- The arrival transition runs to completion independently of fetch timing.
- The constellation appears when the animation and locale-scoped `/api/observe`
  request are ready.
- Failed/timed-out loading shows the breathing fallback with background retries.

When enabled, resonance is a one-shot phrase-level action with a public count in
Observe. It uses `POST /api/phrases/{id}/resonate`.

### Write and Searching

`write/page.tsx` delegates to `_components/entry-form.tsx`. The form accepts up to
800 characters. Searching (`write/_components/searching.tsx`) is the in-flight
submission state, not a route.

`POST /api/entries` receives the selected locale. Crisis, general-flagged, spending-cap
and error outcomes render in Write. Matched and no-match outcomes write a Mirror
handoff and navigate to the locale-aware Mirror route. There is no before/after
emotional scale UI; that decision remains paused in issue #6.

### Mirror

`mirror/page.tsx` and `_components/mirror-screen.tsx` read the Write handoff from
`sessionStorage` (`sm:mirrorHandoff`, implemented in `_shared/mirror-handoff.ts`).
It contains either `{ outcome: "matched", text, entryId, phraseId }` or
`{ outcome: "no_match", entryId }`. Without a valid handoff, the visitor returns to Write.

The matched state reveals the human phrase; no-match reveals localized fixed copy.
The matched interaction offers distinct signals:

- Resonance: one-shot `POST /api/phrases/{phraseId}/resonate`, when enabled.
- Connection intent: reversible `POST /api/entries/{entryId}/connect`, stored as
  `responses.wants_reply`. This does not start a chat or send a reply.

Mirror does not show the public resonance count. Its interaction state survives a
locale change through the shared ritual provider.

### Gratitude and Leave a Trace

`gratitude/page.tsx` renders the same closing transition regardless of match outcome.
`leave-a-trace/_components/leave-a-trace-screen.tsx` then renders either the optional
400-character form or its `submitted`/`skipped` closing state.

Draft and resolved phase live in shared ritual state, so changing language does not
reopen a completed form. Returning Home through the closing CTA resets that ritual
state. Submitted phrases remain inactive after automated moderation until an admin
activates them with an embedding.

## State above the locale segment

`src/app/_components/experience-state/` is mounted from the root layout, above
`[locale]`, so switching language does not reset the active visit:

- `ritual.tsx`: Write draft/outcome, Leave a Trace draft/phase, Mirror actions.
- `contribution.tsx`: standalone Contribute draft, saved confirmation and count.
- `preferences.tsx`: sound preference and introduction progress.
- `form-timing.tsx`, `locale-transition.tsx`: submission timing and language-switch coordination.

Drafts and interaction state are in memory and reset on a full reload or closed tab;
this is not persistent personal history. Mirror handoff in sessionStorage and Home
acknowledgments in localStorage are separate mechanisms with different lifetimes.

## Outside the numbered flow

Contribute loops after each submission and preserves its own state across locale
changes. Resetting the main ritual does not clear Contribute's state.

The Spanish-language admin dashboard handles publication approval/activation, language
filtering, phrase deletion with confirmation, flagged/crisis review, spend and match
metrics. Public bilingual routing does not change its URLs.

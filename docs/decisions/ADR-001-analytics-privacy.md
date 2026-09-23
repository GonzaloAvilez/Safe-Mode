# ADR-001: Analytics tooling and privacy boundary

**Status:** Proposed — leaning toward self-hosted, not yet implemented
**Date:** 2026-08-01
**Context owner:** product/eng

## Context

Vercel's built-in analytics does not provide funnel-level visibility. We need to know, per
screen (`Home → Arrive → Observe → Remember → Write → Searching → Mirror → Leave a Trace →
Gratitude`), where users drop off. Current traffic is near zero, making this diagnosis urgent.

## Options considered

| Tool | Free tier | Data location | Funnel support |
|---|---|---|---|
| PostHog (cloud) | 1M events/mo, 5K session replays | Third-party (US/EU) | Yes |
| Umami (self-hosted) | Unlimited | Own infra | No (traffic only) |
| Plausible (self-hosted, OSS) | Unlimited | Own infra | No (traffic only) |
| Cloudflare Web Analytics | Unlimited | Cloudflare | No (pageviews only) |

## Risk analysis

PostHog's default configuration introduces three risks incompatible with the anonymity
guarantee already enforced elsewhere in the schema (`entries`, `phrases`, `crisis_entries`):

1. **Session recording** — can capture literal input from the Write screen if not disabled.
2. **Autocapture** — can log DOM content, risking partial capture of phrase/entry text.
3. **IP address** — captured by default for geolocation; combined with event timestamps, this
   creates a correlatable signal against `entries.created_at`, especially at low traffic volume
   where each event pattern is more unique.

None of these risks touch the existing server-side pipeline (Moderation API, embedding,
matching). They are specific to introducing a third-party analytics vendor into the request
path.

## Mitigation (if PostHog is used)

```js
posthog.init(KEY, {
  autocapture: false,
  disable_session_recording: true,
  capture_pageview: false,
  persistence: 'memory',
  property_blacklist: ['$ip'],
});
```

Manual events only, no entry/phrase content in any payload:

```
screen_home_viewed · screen_arrive_viewed · screen_observe_viewed
screen_remember_viewed · screen_write_viewed · entry_submitted
screen_searching_viewed · screen_mirror_viewed · mirror_result {matched: bool}
resonate_clicked {screen} · want_to_connect_clicked
screen_leave_trace_viewed · trace_submitted | trace_skipped
screen_gratitude_viewed
```

Even with full mitigation, IP-based geolocation and timestamp correlation remain residual risks
that cannot be fully eliminated client-side with a third-party vendor.

## Decision

Leaning toward **self-hosted Umami or Plausible** inside existing Supabase/Vercel
infrastructure. Trade-off: no funnel/drop-off analysis, only aggregate traffic. Rationale:
consistent with the trust boundary already established for `entries` and `phrases` — no
third party ever holds identifying signal about who used Refugio and when.

Not yet finalized. Revisit once traffic issue (near-zero visits) is independently resolved,
since funnel analysis is moot without visitors.

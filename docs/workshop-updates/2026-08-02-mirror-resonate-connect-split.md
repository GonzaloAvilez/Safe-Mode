# Refugio — Workshop Update

## What we're testing

Whether Mirror's one existing "this resonated with me" toggle was actually backing
two different signals that got conflated by accident, and whether splitting them
into two separate controls is more honest than the single button was.

## Key decision

Before this change, Mirror had a single toggle labeled "this resonated with me" that
wrote to `responses.wants_reply` — a column originally scoped for D16's fake-door
reply test, but repurposed for resonance instead once `phrase_resonances` didn't
exist yet. Two problems followed from that: the phrase-level "this resonated" signal
never reached the same table Observe's resonate button writes to, so a match found
via Mirror never counted toward that phrase's public count on Observe; and
`wants_reply`'s own toggle/undo semantics (a stray tap can be undone) were being
applied to a signal that Observe already treats as one-shot, non-retractable.

Split into two controls on Mirror's matched branch:
- **"This resonated with me"** — now one-shot, writes to `phrase_resonances` via the
  same `POST /api/phrases/[id]/resonate` route Observe uses. The matched phrase's id
  now travels through `MirrorHandoff` (previously only carried the phrase text) so
  Mirror can address the right row. A tap here and a tap on the same phrase in
  Observe, from the same session, dedupe to one row — the composite primary key does
  that for free, no new logic needed.
- **"I would love to connect"** — a new toggle, using `wants_reply` for what its name
  always implied: `/api/entries/[id]/resonate` was renamed to
  `/api/entries/[id]/connect` to match. This is D16's original "I want to reply"
  fake-door intent, now actually wired to its own button instead of sharing one with
  resonance.

## Risk being managed

None new. `phrase_resonances` was already public-per-phrase and rate-limited
end-to-end (see `2026-08-02-resonate-public-counter-risk-accepted.md`) before this
change — Mirror gained a second entry point into the same table, not a new
mechanism. The resonate button on Mirror is gated behind `resonate_enabled`, same as
Observe's; `wants_reply` stays write-only with no reader, same as before the split.

## How to disable

`resonate_enabled` off from `/admin` removes Mirror's resonate button, same as it
already does on Observe. "I would love to connect" isn't part of that flag — it
predates the resonate experiment and stays visible regardless, same as it always has.

## Next step

None pending. `wants_reply` is still nothing-reads-it — if the "I would love to
connect" signal is ever worth acting on, that's a separate, later decision.

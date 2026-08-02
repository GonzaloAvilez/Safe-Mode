# Refugio — Workshop Update

## What we're testing

Whether a private, per-phrase "resonate" tap changes how Observe's own thesis —
"seeing is enough" — actually lands for a visitor, without opening any public counter,
reply, or social-proof surface (see `docs/workshop-updates/2026-08-01-public-narrative-experiment.md`
and its market-research addendum for why a *public* version stays off the table for now).

## Key decision

This was built first on Home, then moved to Observe. Worth recording why, since it's a
real design correction, not a cosmetic move.

Home cycles phrases every ~4.3s, tuned for a first impression with zero prior context —
by design, per the Home spec, it shouldn't explain Refugio, just let a visitor feel it in
a few seconds. That's the wrong container for a considered tap: a first-time visitor has
to notice a button in a new screen position, read it, understand what "resonates" even
means, and decide, all before the phrase fades. Even after tuning the hold time up
(3400ms → 5200ms) and adding pause-on-hover/focus, the fix was fighting the screen's own
purpose rather than fitting it.

Observe is untimed and self-paced — the visitor already chose to stay as long as they
want, looking at the whole corpus as an ecosystem. It's also the screen that most directly
embodies "seeing is enough," so a reaction to *someone else's specific words* belongs
where that thesis is actually being tested, not at the front door.

The backend (`phrase_resonances` table, `recordResonance`, `POST /api/phrases/[id]/resonate`,
the `resonate_enabled` flag, the admin toggle/count in `/admin/phrases`) was already
screen-agnostic by construction — none of it changed for the move, only the UI wiring did.

## Risk being managed

Same private/low-stakes posture as before: never shown to other visitors, no public
counter, aggregate count visible only to admin. The risk specific to this move was
technical, not product: Observe's tooltip already had a deliberate mobile fix — "if a
tooltip is open, the next tap anywhere closes it" — to stop a past bug where a dismiss tap
could accidentally open a neighboring node. A resonate button placed inside that tooltip
would collide with that rule (a tap on the button would just close the tooltip). Fixed by
checking the touch target against the button specifically in `handleTouchStart` before
the dismiss logic runs, so the existing mobile-dismiss fix stays intact for every other
tap, and only the button itself gets carved out.

## How to disable

`resonate_enabled` off from `/admin` (per-environment, same pattern as
`public_narrative_enabled`/`contribute_open`). Observe's canvas reverts to its
pre-resonate tooltip exactly — the button is conditionally unmounted, not just hidden, so
there's nothing left in the DOM to interact with when it's off.

## Next step

Watch real Observe visits with the flag on. If reactions there move the needle on how
"seeing is enough" actually feels, that's real signal for the same open question the
public-narrative experiment is probing from a different angle — and only then would a
*public* version (with its own, separately-considered risk) be worth revisiting.

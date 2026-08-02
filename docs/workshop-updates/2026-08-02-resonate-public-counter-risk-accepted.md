# Refugio — Workshop Update

## What we're testing

Whether showing a visible per-phrase resonate count on Observe — "N others felt this
too" — gives a skeptical first-time visitor real evidence that other people have
actually been here, addressing a gap the private version couldn't: a reaction nobody
else can see doesn't prove anyone else exists.

## Key decision

This reverses the previous decision (see
`docs/workshop-updates/2026-08-02-resonate-observe-pivot.md`), made deliberately and
with the risk named explicitly before deciding, not by default or oversight.

The risk was put on the table plainly: a visible per-item validation signal on
self-harm-adjacent content has real, documented harm to vulnerable users — a UK
coroner's inquest found algorithmically-amplified, engagement-driven self-harm content
"contributed to [Molly Russell's] death in a more than minimal way," and a peer-reviewed
panel study (Arendt, Scherr & Romer, 2019, *New Media & Society*) found exposure to
self-harm content on Instagram prospectively predicted self-harm/suicidality outcomes a
month later — the mechanism being that visible social validation can reinforce the
specific content that earned it (see `project_market_research_findings` in project
memory for full citations).

A lower-risk alternative was offered and considered: a global, non-item-specific count
("N people have passed through Refugio") would give the same evidence-of-others
without rewarding any particular piece of content. The decision was to keep the
per-phrase version anyway — the explicit call was that proof tied to the specific thing
someone related to matters more for this test than the safer, more abstract version.

## Risk being managed

Not eliminated, only partially mitigated: the count renders as a small, quiet text
line ("N others felt this too"), not a badge or a prominent stat, and only appears once
the count is 1 or more — a 0 shows nothing rather than reading as proof of emptiness.
This is deliberately the least amplified visual treatment the number could have, not a
solution to the underlying mechanism.

## How to disable

`resonate_enabled` off from `/admin` (same flag as the button itself — turning it off
removes both the button and the count together, and `/api/observe` stops computing or
returning `resonanceCount` at all, not just hiding it client-side).

## Next step

Watch this closely — it's now a real public surface, not a private/internal one. If
anything about how it's used or reacted to raises concern, the fallback (the global,
non-item-specific count) is already designed and ready to swap in without more research.

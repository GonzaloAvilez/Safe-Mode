<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Respect documented decisions

Before proposing a change to product behavior or scope, or questioning why
something is the way it is, check `ROADMAP.md` and `docs/decisions/` for an
existing decision — plus `docs/feedback-convergence-protocol.md` if it's
feedback-related. Skip this check for routine implementation work (bug fixes,
refactors, tasks with no open scope or behavior question). Don't widen the
search to the rest of the doc tree unless one of these three points you there.

Distinguish an accepted limitation from a defect. If an existing decision
already covers the situation, cite it (e.g. "per ADR-002") and proceed instead
of re-asking why it was made. Reopen a decision only when the task surfaces
new evidence — state what that evidence is.

If the documentation and the code disagree, report the discrepancy and cite
both sides; do not silently pick one to "fix."

## Altitude-guided learning sessions

In Altitude-guided learning sessions — signaled by a `.altitude` file at the
repo root, from the [`altitude`](https://github.com/jasonku09/altitude-skills)
skill pack — treat prior explanations already given in the session as known.
Ask only about what's new or what changed, not to re-verify a concept already
covered — if unsure whether something was covered, ask once, briefly, rather
than re-teaching it. Agents without that skill pack installed can disregard
this section.

# ADR-002: Entry-vs-entry matching (live/synchronous match)

**Status:** Deferred — anonymity redesign required before this becomes actionable
**Date:** 2026-08-07
**Context owner:** product/eng

## Context

`match_phrase` (see `src/lib/phrases.ts`) matches a visitor's `entry` (from Write) against the
`phrases` corpus — never against another visitor's `entry`. Phrases are permanent, curated,
human-moderated content (seed phrases the founder's own real lived experience, or user
submissions approved via `/admin/phrases`). This means "real" in the app's core promise splits
into two distinct senses:

1. **Genuinely human-authored** — already true today.
2. **Live/synchronous** — matched against what someone else is feeling *right now*, not a phrase
   from the past. Not true today, and structurally can't be without matching against other live
   entries directly.

This ADR was triggered by a concrete, diagnosed symptom of sense 2's absence: a real Reddit user
left a *positive* trace (not pain-themed) via Leave a Trace. Walking `match_phrase`'s actual
mechanism confirms that phrase is very likely permanently unmatched — phrases never seek a match
themselves, a future entry has to land close enough to it in embedding space, and the corpus (and
likely most incoming entries) skew heavily toward pain/loss/loneliness, consistent with the app's
whole emotional register. A positive phrase sits in a near-empty semantic neighborhood. This is a
deviation from D7's original stated goal ("wide emotional diversity"), not a designed constraint.

## Options considered

### Option A — AI-suggested Leave a Trace content

Originally proposed (2026-08-07, from a 1:1 conversation) as a way to lower the friction of
writing a second, separate text (Write, then Leave a Trace): an AI-generated suggestion — a
translated/softened version of what was written in Write — offered as a starting point for Leave
a Trace, with the visitor free to edit, replace, or decline and leave in silence.

**Rejected.** Doesn't address sense 2 at all — an AI-assisted trace still becomes a static phrase,
matched later, never live. It only affects corpus *volume*, and directly conflicts with a
principle this project has defended multiple times already: a similar AI-mediated
validation/response mockup was already considered and rejected, and two independent real people
(this project's own founder and a workshop visitor) separately argued that AI involvement beyond
matching "would make the connection feel fake." Even the note proposing this option named the
tension itself rather than presenting it as settled.

### Option B — Full entry-vs-entry matching, raw text shown

Match a visitor's entry directly against other visitors' live entries, showing the matched
entry's actual text in Mirror.

**Rejected outright.** Breaks RulesGate's explicit, recently-added privacy guarantee ("what you
write stays private, only ever compared against what others have left, echoing back or not" —
added 2026-08-03 specifically because a real visitor didn't understand the mechanism). Entries
are never moderated before creation, because they were never designed to be shown to anyone but
their own author — surfacing one to a stranger, even mediated, would require a parallel
moderation/consent pipeline that doesn't exist today.

### Option C — Entry-vs-entry matching, phrase-mediated (never show raw entry text)

Match live entries against each other for *existence* (is someone else feeling something similar
right now), but never display the matched entry's text — instead surface a related `phrase` from
the existing curated corpus, letting the visitor know someone else felt something similar.

**More refined than B, but still deferred, not actionable today:**

1. **A subtler privacy leak survives.** Even with no raw text shown, a private entry's mere
   *existence* would now shape a stranger's Mirror experience (which phrase surfaces). Today's
   "never shown to anyone" promise is understood as "my words go nowhere" — this repurposes a
   private entry as an input to someone else's experience. Smaller than Option B's leak, but real,
   and would need its own explicit consent step, not an assumption that omitting raw text already
   covers it.
2. **No moderation policy exists for entries influencing anyone but their own author.** Even a
   phrase-mediated version means entries (including non-crisis, non-flagged ones) start
   influencing a stranger's experience — a new kind of "publication" the current safety pipeline
   (built entirely around entries never surfacing to anyone) doesn't cover.
3. **Doesn't solve the diagnosed problem.** The positive-trace-orphaned issue is a *corpus
   emotional-skew* problem, orthogonal to whether the matching source is `phrases` or `entries` —
   if incoming entries are also pain-skewed (likely), entry-vs-entry has the same scarcity problem
   for positive content that phrase-matching has today.
4. **Value is gated on traffic anyway.** Near-zero current traffic (see
   [ADR-001](./ADR-001-analytics-privacy.md)) means a live matching entry would rarely exist at
   any given moment — in practice this would mostly behave like today's system, for a real build
   cost (new similarity calibration, a time-window concept, a new consent/safety design) paid now.

## Decision

**Deferred, not rejected.** The user's own framing: any version of entry-vs-entry matching is "a
radical change that violates user anonymity" and cannot be defined or built until an
anonymity-preserving redesign exists for it — a hard gate, not a someday-maybe. Revisit only once:

- Real traffic volume makes live matching plausible (same gating condition as ADR-001's funnel
  analysis), **and**
- An explicit consent/moderation design exists for entries influencing a stranger's experience,
  even phrase-mediated.

**What actually addresses today's diagnosed problem instead:** deliberate emotional diversity in
new phrases (seed and Contribute-sourced), not just volume. D24-25 ("100+ seed phrases," not yet
started) needs to explicitly target this as a goal, not just hit a count. Cheaper, already
roadmapped, zero conflict with any established principle.

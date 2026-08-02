# Refugio — Workshop Update

## What we're testing

Whether an abstract, LLM-derived "public narrative" (theme, need, emotional transition,
one-sentence third-person summary) surfaced on Home — alongside the real date, for
user-submitted phrases only — changes how it feels to arrive at Refugio, before deciding
whether the same idea is worth applying to `entries` at all.

This came out of the 2026-07-30 feedback that questioned the core "seeing is enough"
thesis directly. Rather than deciding that question by argument, it's being tested as a
scoped, reversible experiment first.

## Key decision

Three constraints, deliberate from the start:

1. **Scoped to `phrases`, never `entries`.** `phrases` (`source='user'`, via Leave a
   Trace/Contribute) are already public and already human-approved before publish — the
   person who wrote them knew it would be shown. `entries` are private, never displayed
   to anyone, and the person who wrote one never consented to a derived summary of it
   being shown either. Privacy here is handled by *scope* (only touching already-public,
   already-consented text), not by asking the classifier prompt to promise abstraction on
   its own — a prompt instruction is not a privacy guarantee.
2. **Isolated into its own table (`phrase_narratives`)**, same reasoning as
   `crisis_entries` isolating sensitive content from `entries`. Killing this experiment
   is `drop table phrase_narratives`, with zero risk to `phrases` itself — read by
   `match_phrase`, Observe, Home, and the admin panel.
3. **Off by default, one flag (`public_narrative_enabled`) to kill it.** Fails closed,
   same posture as `contribute_open`. With the flag off, Home's query and render path are
   byte-for-byte the same as before this experiment existed.

Classification is triggered manually, one phrase at a time, from `/admin/phrases` —
not automatic on phrase activation. `/admin/phrases` is already an audit tool, not an
approval gate; this keeps the same human-in-the-loop posture and keeps the (small)
OpenAI spend voluntary and visible, rather than firing unattended on every future
phrase.

## Risk being managed

An LLM abstracting someone's real, already-public words can still get the tone or
theme wrong — flattening or misreading something a person meant with more nuance.
Mitigated three ways: the admin panel shows `confidence` and the generated narrative
before it's ever shown on Home, so a low-confidence or off-tone result is visible to a
human before anyone else sees it; the trigger is manual, not automatic; and the whole
thing is one flag flip away from being fully off.

## How to disable

- **Soft kill:** flip `public_narrative_enabled` off from `/admin` (per-environment,
  same as `site_public`/`contribute_open`). Home reverts to plain phrase text
  immediately.
- **Hard kill:** `drop table phrase_narratives`. No other table or code path depends on
  it existing.

## Next step

Watch it with real visitors before deciding anything about `entries`. If the narrative
+ date on Home doesn't change how "seeing is enough" actually feels, that's real signal
against extending this to entries at all — not just a failed experiment.

# Project: Safe Mode

## About me

I'm building this app, but I haven't written a line of its code yet. Claude Code has
written all of it — Week 1 and Week 2 of a 4-week workshop plan, 141 commits deep. I've
used ChatGPT for design mockups and Claude/Gemini for research. My contribution so far
is product judgment and direction: what the app should feel like, what's safe or unsafe
to build, what to cut, what to fix — steered commit by commit, PR by PR, with real design
briefs behind the screens (see the "Refugio" mockup conversations referenced in
ROADMAP.md). What's missing isn't taste or direction. It's the ability to read, change,
and explain the code myself.

The part that scares me most, and the first thing this method should open up, is the
matching pipeline: how a piece of text actually becomes an embedding, and how that
embedding finds another person's phrase behind the scenes.

## The idea

Safe Mode is an experiment, grounded in research papers, for people — right now, scoped
to burned-out tech workers — to say something out loud that they normally wouldn't tell
anyone, because admitting it would read as vulnerability. Someone writes a short piece of
text. Instead of a reply or a chat, the app finds a *stranger's* past phrase that felt
the same thing, using OpenAI embeddings and cosine similarity, and shows that as a
"mirror." No chat, no replies, no identity — deliberately, since (per prior research) every
competitor that added chat/reply features (7 Cups, PostSecret app, Koko) ran into an
abuse or trust incident.

## MVP

**In** (built, shipped, working today — verified: 127/127 unit tests pass, clean git tree):
- Full 9-screen experience flow: Home → Arrive → Observe → Remember → Write → Searching →
  Mirror → Gratitude → Leave a Trace
- Embedding-based matching (`match_phrase` RPC, HNSW cosine index, similarity floor 0.5)
- Safety pipeline: OpenAI Moderation API, conservative self-harm threshold, crisis text
  isolated into its own `crisis_entries` table with a 30-day anonymization cron
- Anonymous signed-cookie sessions, rate limiting (Upstash sliding window), RLS
  deny-by-default on every table
- $5/day hard spend cap with usage tracking
- Admin panel: phrase moderation, crisis/flagged review, spend dashboard
- Per-environment site-visibility flags (maintenance-mode gate), `/contribute` seed page
- CI (lint/typecheck/test/build) gating both `master` and `preview`
- Integration tests against a real local Postgres (most recent work, this branch)

**Frozen** (built, deliberately not merged/finished — debt with a name, not failure):
- D10 generative ambient audio (handpan pad) — complete on branch
  `week2/handpan-ambient-audio`, never merged anywhere
- Mirror screen — flagged for a follow-up adjustment pass, scope not yet defined
- Gratitude screen — same, follow-up pass with scope TBD
- Write screen's violet-accent-canvas visual update from the later mockups — never applied

**Parking lot** (real backlog, Week 3-4 of the original plan, not yet started):
- Before/after 1-5 scale UI (schema exists, no screen control)
- 5 real users + feedback adjustments (gated on soft-launch timing)
- Soft launch (flip `site_public:production`), metrics/narrative, demo-day prep
- Bot/abuse protection beyond rate limiting (honeypot + timing check)
- Human pre-approval gate before a phrase publishes (currently: AI-verdict-only, admin
  panel audits after the fact)
- Multi-language content / same-language-only matching (current corpus and threshold are
  Spanish/English-only, untested cross-lingual)

## Triage decision: **Adopt**

Reasoning: this isn't a pile of half-built AI scaffolding — it's a working, tested MVP
with a legible, already-sequenced backlog (the existing ROADMAP.md tracks Week 1-2 done,
Week 3-4 clearly scoped, not started). Nothing needs trimming: the "frozen" items are
named and small, not evidence of overbuilding. Rebuilding is off the table — the stack
(Next.js 16, Supabase/Postgres+pgvector, OpenAI, Upstash) is the boring, popular, well-
documented choice, and the app runs and passes its full test suite today. We map it as-is
and plan forward from here.

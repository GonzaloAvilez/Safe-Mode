# Refugio — Feedback Convergence Protocol
Portable document. Use the same text with Claude, ChatGPT, and Gemini to compare readings across models on the same piece of feedback.

---

## How to use this document

Paste this full protocol at the start of a conversation with any model, along with:
1. The new feedback (verbatim text, with source if known)
2. The current convergence state (see Section D, update every time)

Ask the model to follow steps 1-5 in Section B, in order, without skipping any.

---

## SECTION A — What Refugio is (fixed context, does not change)

Anonymous digital space for processing burnout/emotional transition. The user writes something (`entries`) → semantic matching via embeddings against a corpus of anonymous phrases (`phrases`) → receives the closest "mirror," written by another real person. Zero AI-generated responses. Radical anonymity.

**Core thesis:** see → feel safe → remember → dare → act. Never tell the user how to feel — only show evidence and let them arrive at their own conclusion. The goal is not directed catharsis or retention — it's genuine recognition, regardless of whether the user comes back or not.

---

## SECTION B — Analysis process (5 steps, in order, for each new piece of feedback)

### Step 1 — Classify by design level (Norman's framework)
- **Visceral**: is the comment about immediate reaction (colors, sound, first impression)?
- **Behavioral**: is it about whether the flow makes sense, confusion about what to do, navigation friction?
- **Reflective**: is it about the meaning the person constructed afterward (their own metaphors, sense of genuine connection)?

Note: Norman's reflective level has two distinct variants — social/status (visibility to others, brand, prestige) and private/interior (self-reflection, no audience, "home of reflection, conscious thought, how one remembers the experience"). Refugio, being anonymous, cannot achieve the social/status variant by design — it can only achieve the private/interior variant. Do not conflate the two when classifying feedback.

A single piece of feedback can touch more than one level — mark all that apply.

### Step 2 — Check against decisions already made (do not reopen without explicit discussion)
Before proposing any change, check whether the feedback pushes toward something already decided against:
- Never AI-generated responses
- Never persistent usernames or profiles
- Never public counters visible in Mirror (allowed in Observe, never at the moment of highest vulnerability)
- Matching threshold at 0.40 — recalibrate only with new quantitative evidence from the live corpus

If the feedback conflicts with any of these, flag it explicitly as **tension with existing decision**, not as an action to execute automatically.

### Step 3 — Evaluate triangulation
- How many independent sources (who don't know each other) have said something similar?
- **1 source = individual observation**, note but don't act yet
- **2-3 independent sources = emerging pattern**, worth a low-risk fix
- **4+ independent sources = confirmed pattern**, high action priority

Reference point: qualitative research on thematic saturation (Guest, Bunce & Johnson, 2006, *Field Methods* 18(1)) found that code saturation occurred by around interview 12, with 73% of codes identified within the first six (not 80% — that figure is from a different, unrelated study the paper cites in passing). The authors explicitly caution against generalizing their number beyond a relatively homogeneous population with a narrow, structured research question — they do not endorse a general "12-30" range for applied work. Treat this as a loose reference point, not a target: Refugio's individual sub-questions are narrow enough that saturation can appear faster, but the source population (workshop-adjacent, self-selected, mixed channels) is not homogeneous, so don't lean hard on Guest et al.'s specific number as justification for a source count.

### Step 4 — Distinguish type of user "arrival," if applicable
Feedback about initial confusion: distinguish whether it comes from someone with prior context (already knew what Refugio was) or a "cold arrival" (no context, e.g. from Reddit without having read anything). Minimal wayfinding solutions apply mainly to cold arrivals — don't redesign for someone who already flows well with the ambiguity.

### Step 5 — Propose, don't execute
Expected model output:
- Norman level(s) touched
- Whether it conflicts with an existing decision (yes/no, which one)
- Updated triangulation count
- One proposed action (or "no action, monitor only")
- Never modify code or make the final decision — only propose

---

## SECTION C — Interpretation rules (to avoid contradictory readings between models)

- A generic compliment ("I like it", "great idea") **does not count** as reflective-level evidence — it only counts if the person builds their own specific metaphor or description without being prompted to.
- Suggestions for "more engagement," gamification, or niche segmentation must be evaluated against Step 2 before being accepted as generic product best practice — Refugio is not a standard consumer product.
- Feedback about basic accessibility (font size, contrast, legibility) is always treated as high-priority and low-risk, without needing much triangulation — it does not compete with the product's philosophy.

---

## SECTION D — Current convergence state (update after each analysis round)

_Paste the most recent topic/source/status table here before analyzing new feedback, so the model compares against real history instead of starting from zero._

| Topic | Sources (verified distinct people) | Status |
|---|---|---|
| Font size | 4 | Resolved 2026-08-19 — fluid clamp()-based sizing shipped to master (PR #170) |
| Entry confusion | 5+ | Diagnosed — minimal wayfinding for cold arrivals |
| Genuine reflective connection | 4+ | Strongly validated — do not touch |
| Small corpus (bottleneck) | Own quantitative data (not a feedback source — different category) | Pending — high priority, non-technical |
| Segmenting audience | 1 | Noted, not acted on — conflicts with universality thesis, but single-source, not triangulated |
| Is one encounter enough? | 1 | Unresolved — founder decision, not code. Needs more independent sources before treating as confirmed pattern |
| Own domain (vs. vercel.app) | Internal analysis (not a feedback source — different category) | Resolved 2026-08-15 — production now serves from refugiospace.com |

---

## SECTION E — When comparing across models

If Claude, ChatGPT, and Gemini read the same feedback with this protocol and reach **different** conclusions in Step 5, that is valuable information in itself — it signals a genuinely ambiguous decision, not an error by any one model. Document the disagreement, don't average it away automatically.

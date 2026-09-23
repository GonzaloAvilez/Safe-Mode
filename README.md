# Safe-Mode (Refugio)

A quiet space for people who feel alone in what they're going through.

Users write something real — no pressure, no perfect words — and, when a same-language phrase meets the similarity threshold, receive an anonymous phrase written by someone else. No chat, no profiles, no engagement loops — just proof that someone else already put a similar feeling into words.

Built with Next.js, Supabase (pgvector), and OpenAI embeddings for semantic matching from private entries to the human-authored phrase corpus.

AI moderates submissions and matches private entries to human-authored phrases using embeddings.
An optional, admin-triggered experiment also derives narrative metadata for public phrases.
Mirror never presents an AI-generated reply as someone’s words. User-submitted phrases require
human activation before joining the public corpus.

The flow is nine screens: Home → Arrive → Observe → Remember → Write → Searching → Mirror →
Gratitude → Leave a Trace. Nothing is ever attributed to a name — anonymity isn't a setting, it's
the foundation the whole experience is built on.


## Status

The public experience supports English (`/en/*`) and Spanish (`/es/*`), including
same-language matching and Observe. Bilingual rollout is complete ([issue #178](https://github.com/GonzaloAvilez/Safe-Mode/issues/178)).

Full build status, decisions, and what's still open
live in [ROADMAP.md](./ROADMAP.md) — that file, not this one, is the source of truth for what's
actually shipped.

## Setup

Requires Node 24+ and Docker (for the local Supabase/Postgres stack).

```bash
git clone <repo-url>
cd Safe-Mode
npm install
cp .env.example .env.local
```

The project uses OpenAI for embeddings, so `OPENAI_API_KEY` needs a real value in `.env.local`
even for local development. `npm run dev` will start fine without it, but the moment you hit a
screen that calls `/api/entries` or `/api/phrases`, those routes construct the OpenAI client and
you'll get a 500.

```bash
npm run dev
```

`npm run dev` boots a local Supabase/Postgres stack automatically (`scripts/dev-local-setup.sh`)
and regenerates `.env.development.local` with local Supabase settings. Next.js also loads
`.env.local`: OpenAI, Redis and session/admin secrets still come from there unless overridden.
Redis uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; copying them into the
generated file is unnecessary and would be overwritten on the next start. Local development
still calls configured external providers when those features are exercised.

Use `npm run dev:cloud` only when deliberately targeting the shared database. One-off scripts
must explicitly load the intended environment; they do not inherit Next.js environment-file
precedence automatically. Never commit `.env.local` or credentials.

### Tests

```bash
npm test                 # fast unit tests, fully mocked
npm run test:integration # real local Postgres, via scripts/run-integration-tests.sh
```

For routing and state ownership, see [the screens map](./docs/screens-map.md). Recorded
bilingual and Redis checks, with their coverage limits, live in [the QA report](./docs/qa/bilingual-local-qa.md).

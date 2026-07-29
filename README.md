# Safe-Mode (Refugio)

A quiet space for people who feel alone in what they're going through.

Users write something real — no pressure, no perfect words — and receive an anonymous phrase from someone else who felt something similar. No chat, no profiles, no engagement loops — just proof that someone else already put a similar feeling into words.

Built with Next.js, Supabase (pgvector), and OpenAI embeddings for semantic matching between entries.

AI's role is deliberately narrow: it only matches a visitor's entry against real, anonymous human
phrases by meaning (embeddings). It never generates a response, a reply, or anything shown to a
visitor as if it were human — the goal is human interaction, not an AI conversation.

The flow is nine screens: Home → Arrive → Observe → Remember → Write → Searching → Mirror →
Gratitude → Leave a Trace. Nothing is ever attributed to a name — anonymity isn't a setting, it's
the foundation the whole experience is built on.


## Status

Built as a 4-week guided workshop project. Full build status, decisions, and what's still open
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
— it never touches the real shared project. Use `npm run dev:cloud` instead if you need to point
at the real database.

### Tests

```bash
npm test                 # fast unit tests, fully mocked
npm run test:integration # real local Postgres, via scripts/run-integration-tests.sh
```

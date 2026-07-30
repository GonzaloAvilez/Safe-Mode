# Contributing

Thanks for wanting to help with Safe-Mode (Refugio). This is a small based human project experience, so
expect a small, evolving codebase — ask questions, don't assume.

## Setup

See [README.md](./README.md#setup) — clone, install, environment variables, running the dev
server and both test suites. Don't duplicate those steps here.

## Fork first

External contributions go through a fork, not a branch pushed directly to this repo. Fork the
repository on GitHub, then clone **your fork** (not this one) when following the Setup steps
above. Push branches to your fork, and open the PR from there against this repo's `master`.

### Keep your fork in sync

Add this repo as a second remote once, right after cloning your fork:

```bash
git remote add upstream https://github.com/GonzaloAvilez/Safe-Mode.git
```

Then, **before starting any new branch**, and again **before opening a PR** if your branch has
sat around for a while, pull the latest `master` in:

```bash
git checkout master
git fetch upstream
git merge upstream/master
git push origin master
```

This isn't just tidiness. A stale fork causes two concrete, real problems: your `package-lock.json`
diff fills up with unrelated dependency churn instead of just your actual change (this happened
on a real PR), and you can be working against files or docs that no longer exist on `master` —
including, ironically, an outdated copy of this very file.

## Branch & PR workflow

This project follows a one-branch-per-concern rule, so it's easy to give feedback when
reviewing commit history — every branch is one topic, so you can tell at a glance when a
feature was added or a bug was fixed. Think of it like storytelling: one branch, one story.

If your contribution touches more than one concern, split it into two or more branches. Branch
naming otherwise follows normal GitHub conventions — you'll see historical branches prefixed
`week1/` through `week4/` in this repo, but those just followed the original workshop's
week-by-week roadmap; please use standard naming for new work instead.

Migrations are the one hard exception: a migration file must always go in its own branch,
never bundled with app code — this isn't negotiable. The reason is mechanical, not stylistic:
when a migration lands on `master`, a CI workflow (`deploy-migrations.yml`) pushes it straight
to the real production database. Bundling it with unrelated code means that code ships live at
the exact same moment, with no way to review or deploy them separately.

**Nothing is ever committed directly to `master`.** Push your branch to your fork and open a
PR from there (`gh pr create`, or the GitHub UI).

## Commit messages

This project loosely follows [Conventional Commits](https://www.conventionalcommits.org/)
style: `type(scope): short description`. Common types seen in history: `feat`, `fix`, `docs`,
`chore`, `test`, `refactor`. This isn't enforced by a linter — write something in that shape,
don't stress over getting the type exactly right.

## Before opening a PR

```bash
npm run lint
npx tsc --noEmit
npm test
```

If your change touches `supabase/migrations/**`, `src/lib/entries.ts`, or `src/lib/phrases.ts`,
also run:

```bash
npm run test:integration
```

## What CI actually checks

Every PR runs `ci.yml` (lint, typecheck, unit tests, build) automatically — see
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml). `integration-tests.yml` only runs if
your PR touches the paths listed above. `deploy-migrations.yml` never runs on a PR — it only
fires on a push to `master` that includes a migration file, and it pushes straight to the real
production database. That's why migrations always get their own PR, never bundled with
unrelated app code.

## Picking up an issue

Look for the [`good first issue`](https://github.com/GonzaloAvilez/Safe-Mode/labels/good%20first%20issue)
label. Comment on the issue before starting so it doesn't get worked on twice.

# ADR-005: Push notifications tied to an identity, no accounts

**Status:** Proposed 2026-11-23. Direction chosen by the founder. Revised 2026-11-24 after review (where opt-in is offered, `after()`, per-identity opt-out, one notice per delivery, names). The notice's title is still open.
**Date:** 2026-11-23
**Context owner:** product/eng
**Related:** [ADR-004](./ADR-004-mutual-connection-between-strangers.md) (layer 7, identity model), [ADR-003](./ADR-003-bilingual-routing-and-matching.md), `docs/feedback-convergence-protocol.md`

## Context

Letters (ADR-004) are pull-only. A letter is delivered once a human approves it, up to 48 hours
after it was written, and the other person only finds out by coming back to the mailbox and
choosing the picture of their seal. Nothing tells them anything is waiting. A letter that nobody
comes back for is anonymized after 60 days, unread. ADR-004 layer 7 deferred notifications on
purpose: "Push/email notifications are deferred... can be added later via an outbox".

On 2026-11-11 an outside suggestion proposed making Refugio a PWA, so it can send push
notifications, plus an optional login. On 2026-11-19 the founder leaned against the login: it
breaks anonymity for whoever opts in, and two ways in (seal or account) both lead to the same
mailbox. On 2026-11-23 the founder chose to build push now, **with no login and no email**:
everything tied to the seal. The founder also asked for a small, modular design that can later
grow to accounts without a rewrite.

## Options considered

| Option | How the person hears | Why not (or why) |
|---|---|---|
| **A. Web push tied to the identity** ✅ | The browser or installed app shows a notice | No PII. One way in (the seal). Free: Apple, Google and Mozilla deliver web push at no cost, and Apple needs no Developer Program membership ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit](https://webkit.org/?p=12945)) |
| B. Accounts with email (Supabase Auth) | Email | Reaches everyone without installing anything, and would allow recovery. But it links an email to letters, so a breach could expose "this email wrote these letters". It also creates the two-path flow the founder rejected. Email also needs a paid sending provider |
| C. A third-party push service (OneSignal, paid Firebase features) | The browser or app | Puts another company between Refugio and its people, holding device ids next to Refugio's. Nothing it offers is needed |
| D. A calendar reminder (.ics) after sending | The calendar | Costs nothing and stores no data, but it only reminds people to come back. It can't say that a letter actually arrived. It can be added later as a complement |

## Decision

### Shape: one call, separate channels

The rest of the app knows exactly one function: `notify(identityId, event)`. It doesn't know how
the notice travels.

```
approveLetter ──► notify(identityId, "letter_delivered")
                      │
                      ▼
               src/lib/notifications/
                 ├── notify.ts       picks the message, hands it to every channel
                 ├── messages.ts     notice text per event and locale
                 └── channels/
                       └── web-push.ts   the only channel today
```

- **A subscription is owned by an identity, not by a credential.** This is ADR-004's rule
  ("content is owned by an identity, never by a credential") applied to delivery addresses. If
  accounts come later, they are a new credential kind in `identity_keys` pointing at the same
  identity, and existing subscriptions keep working, with no data migration.
- **A channel is one file with one contract:** `send(identityId, message)`. Email, if it ever
  exists, is another file under `channels/`. `approveLetter` and the mailbox never change for it.
- **Domain code never waits on a notice, and never loses it to the response ending.** An
  unawaited promise can be cut off once the response is sent, so the notice is scheduled with
  Next's `after()`, which runs on Vercel's `waitUntil`. `after()` is supported in Server
  Functions, and `/api/phrases` already uses it for phrase moderation.
  - `approveLetter` stays free of Next and of notices: it only reports whether the delivery was
    applied.
  - The caller, the admin's `approveLetterAction`, schedules
    `after(() => notify(recipient, "letter_delivered"))` when it was.
  - `notify()` is best-effort. A failed notice is logged, never with letter content, and the
    letter stays delivered.
  - No outbox and no retries now. If they're ever needed, `notify()` can write to an outbox table
    internally without changing its callers, which is the outbox ADR-004 anticipated.

### Data

A new table, `push_subscriptions`, in its own migration PR:

| Column | Purpose |
|---|---|
| `identity_id` | Owner. `on delete cascade`, so the abandoned-identities cron also removes its subscriptions |
| `endpoint` | The device address the browser hands out |
| `p256dh`, `auth` | Keys used to encrypt the notice for that device (RFC 8291) |
| `locale` | The language to write the notice in. Identities have no language, so this is the route locale at the moment of subscribing (consistent with ADR-003) |
| `created_at` | |

- Unique on `(identity_id, endpoint)`, not on `endpoint` alone: one browser holds a single push
  subscription per site, and one person can own several identities (a trace they left and a
  letter they sent).
- RLS on with no policies, plus explicit grants, like every other table.
- No link to `entries`, to `sm_session`, or to anything that identifies a person.

### Who gets a notice (v1)

When `approveLetter` delivers a letter, only the **person receiving it** gets a notice:
- a letter from the visitor notifies the phrase's author;
- a letter from the author notifies the visitor;
- a seed phrase the founder answers has no identity to notify.

**One notice per delivery that actually happened.** `approveLetter` only moves a letter from `held`
to `delivered` if it's still held (`.eq("status", "held")`). With two approvals at once (a double
click, two tabs), one wins and the other gets `already_decided`. The notice is scheduled only for
the one that won, so concurrent approvals send a single notice.

Rejections and "your letter was delivered" don't send anything in v1. Each would be one more
event in `messages.ts` and one more `notify()` call.

### The notice

- **It never carries letter content, the phrase, or anything the person wrote.** It shows on a lock
  screen, so it can't say more than "something is waiting".
- **Tapping it opens `/{locale}/mailbox`.** The person still chooses the picture of their seal to
  get in, because the seal is never stored on the device. The notice alone opens nothing.
- **TTL is 7 days.** If the device is off or the browser is closed for longer, the notice is
  dropped. A week late still makes sense, since letters live for 60 days.
- **Sent with `Topic: mailbox`** (RFC 8030): where the push service supports it, several pending
  notices collapse into the last one. They would all say the same thing anyway.

### Subscribing and unsubscribing

Both routes require the seal as a Bearer token, the same as `/api/mailbox`:
- `POST /api/notifications/subscription` links this device to that identity.
- `DELETE /api/notifications/subscription` removes only the `(identity, endpoint)` row.

**Where it's offered.** Only where the seal is already in memory, so nobody is asked to choose the
picture again just to opt in:
1. **The Leave a Trace closing ("sealed").** The phrase's author is the person who most needs a
   notice, because they wait for a first letter that may never come. Their seal is only in memory
   during the ritual.
2. **The Mirror closing ("sent")**, after the first letter.
3. **Inside the opened mailbox.**

Today both closings drop the seal from memory the moment they're reached: `finishSealing()` in
Leave a Trace, and `phase: "sent", key: null` in `FirstLetterFlow`. They will instead drop it when
the person leaves the closing. It's still memory only, never browser storage, and returning home
still clears it (`clearRitualState`).

**Opting out is per identity.**
- Turning `LetterNotificationsToggle` off removes only that identity's row. It does **not**
  unsubscribe the browser, because another identity on the same device may still use the same
  endpoint.
- When a push service answers 404 or 410 (the person revoked permission in the browser, or the
  subscription expired), **every** row with that endpoint is deleted on the spot. Other failures
  (429, 5xx) keep the rows.
- There is no endpoint-only delete. Someone without their seal opts out by revoking the
  permission in the browser, which the 404/410 rule then cleans up. That's one less route to
  protect.

Off by default. It's offered, never asked for on arrival.

### Installable app (minimum PWA)

- An `app/manifest.ts` and 192/512 icons, so the site can be installed.
- A minimal service worker at `public/sw.js` that only shows the notice and opens the mailbox on
  tap. It does no offline caching and touches no other request.

### Keys

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (the site URL, not an
  email).
- **The same values in Production and Preview.** They share one database, so a subscription created
  on Preview can receive a notice sent from Production. That only works if both sides sign with
  the same keys, the same reasoning as `RETURN_KEY_HASH_SECRET`.
- The founder generates them. They never pass through an assistant session. Without them,
  `notify()` does nothing, so code can merge before the keys exist.

### Accepted limitations

- **iOS only delivers web push to an installed app** (iOS 16.4+, added to the Home Screen). In
  Safari without installing, it isn't available. The opt-in shows one plain line explaining
  how to install. No more effort goes into iOS: building a native app is out of scope.
- **Desktop Chrome must be running** to show a notice (it can be running with no windows open). If
  it's closed, the notice waits until Chrome opens, within the TTL.
- **Two identities subscribed from the same browser share an endpoint**, so the database can tell
  that the same device holds both. These are the person's own identities, and it only happens
  when they opt in on both. Recorded here as a known trade-off, not a defect.
- **The push service (Apple, Google, Mozilla) sees** that refugiospace.com sent this device a
  notice and when. It can't read the text, which is encrypted end-to-end (RFC 8291), and the
  text is generic anyway.

## Open decisions (resolve in review, before code)

1. **The notice's title:** "Refugio", or something neutral that doesn't name the app? Showing the
   name of an emotional-support space on a lock screen says something about the person.
   - Body proposed: ES "Tienes una carta esperándote." / EN "A letter is waiting for you."
2. ~~Names~~ **Resolved in review (2026-11-24):**
   - table: `push_subscriptions`;
   - module: `src/lib/notifications/` (`notify`, `messages`, `channels/web-push`);
   - routes: `/api/notifications/subscription`;
   - browser code: `src/lib/push-client.ts`;
   - component: `LetterNotificationsToggle`, renamed from `NotifyMeToggle` so the name says which
     notices it controls;
   - event: `letter_delivered`.

## Deferred

- Email or accounts as a credential and as a channel (ADR-004's "Recoverable" mode). Still possible
  later through the shape above. Not now.
- A "device session" credential, so a notice could open the mailbox without choosing the
  picture. It's already listed in ADR-004's identity model as a later credential kind.
- More events: rejection, "your letter was delivered", and notifying the founder of letters
  waiting for review (the founder isn't an identity, so that would be a different recipient).
- The .ics reminder (option D).

## Build order

1. **Docs:** this ADR.
2. **PR 1, migration:** `push_subscriptions`, alone.
3. **PR 2, server:** `notifications/`, the routes, and the `approveLetter` hook. It stays dark
   without the keys.
4. **PR 3, browser:** the manifest, icons, service worker and `LetterNotificationsToggle`, with
   the seal kept until the closing is left.

**The implementation PRs must test:**
- **PR 2:**
  - opting out with several identities on one endpoint: only that identity's row goes, and the
    others still get notices;
  - a 404/410 deletes every row for that endpoint, while 429/5xx delete nothing;
  - two concurrent approvals of one letter schedule exactly one notice;
  - a failed notice leaves the letter delivered;
  - no notice ever carries letter text.
- **PR 3:**
  - the seal is still available in both closings;
  - leaving a closing, or returning home, clears it.

Verification follows the usual rules: `next build` + `next start`, a real end-to-end push in local
Chrome against a local database, and desktop plus phone widths.

## Convergence protocol

Run as a sanity check, per `docs/feedback-convergence-protocol.md`:
- **Norman level:** behavioral (knowing something is waiting) and reflective (feeling answered
  rather than forgotten).
- **Tension with existing decisions:** none with this design. The login half of the original
  suggestion would have been in tension with "never persistent usernames or profiles"; that
  half is not built.
- **Triangulation:** one outside source (2026-11-11), plus the product's own gap: delivered
  letters nobody hears about. That's not a triangulated pattern. **This is the founder's call,
  made knowingly.**

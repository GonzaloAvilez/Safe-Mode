// ADR-005: Refugio's service worker. It only shows a notice and opens the mailbox when the notice is
// tapped. It has no fetch handler, so it caches nothing and never touches any other request.
//
// The notice's text comes from the server: { "title": string, "body": string, "locale": "en" | "es" }.
// It never carries letter content. The mailbox opens in the notice's locale; anything else falls
// back to English, the same default as src/lib/locale.ts (duplicated: this file isn't bundled).

const SUPPORTED_LOCALES = ["en", "es"];
const DEFAULT_LOCALE = "en";
// Sent to an open Refugio window instead of navigating it. The page acts on it; only the page
// knows whether it's holding an unsent draft. Nothing listens yet — PR 3b adds that.
const OPEN_MAILBOX = "refugio:open-mailbox";
// Only reached if a push arrives without a readable payload. Every push must show something, or
// the browser shows its own generic notice instead.
const FALLBACK_TITLE = "Refugio";

// No payload or one that isn't JSON both land in the catch. Whatever a readable payload holds,
// each field is checked where it's used.
function readNotice(event) {
  try {
    return event.data.json() || {};
  } catch {
    return {};
  }
}

function mailboxUrl(locale) {
  return `/${SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE}/mailbox`;
}

// A window on one of the experience's pages: its first path segment is a supported locale. Those
// are the pages that listen for OPEN_MAILBOX (OpenMailboxFromNotice, in their layout).
function isExperienceWindow(client) {
  try {
    return SUPPORTED_LOCALES.includes(new URL(client.url).pathname.split("/")[1]);
  } catch {
    return false;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const notice = readNotice(event);
  event.waitUntil(
    self.registration.showNotification(typeof notice.title === "string" && notice.title ? notice.title : FALLBACK_TITLE, {
      body: typeof notice.body === "string" ? notice.body : "",
      icon: "/icons/icon-192.png",
      // One notice on screen at a time, like the `Topic: mailbox` the server sends with it.
      tag: "mailbox",
      data: { url: mailboxUrl(notice.locale) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || mailboxUrl(), self.location.origin).href;

  // The ritual and its drafts live only in memory, so no Refugio window may be navigated away
  // from under someone. Three cases, in order:
  //
  //   1. A window already on the mailbox: focus it, nothing is lost.
  //   2. Any other window of the experience: focus it and send OPEN_MAILBOX. It is NOT navigated,
  //      and openWindow is NOT called — `clients.openWindow()` does not promise a *new* window. In
  //      an installed app Chrome can reuse the standalone window that is already open (Android,
  //      Windows), which would navigate away from a draft. Avoiding `client.navigate()` alone
  //      isn't enough to keep that promise.
  //   3. No window of the experience: open one. The admin and /closed hold no ritual in memory,
  //      so there is nothing to lose there.
  //
  // Only the experience's pages (/en/…, /es/…) listen for OPEN_MAILBOX, so only they are sent it:
  // a focused admin tab would swallow the tap, and the mailbox would never open (#286 review).
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const onMailbox = windows.find((client) => client.url === url);
      if (onMailbox) return onMailbox.focus();

      const experience = windows.filter(isExperienceWindow);
      const open = experience.find((client) => client.focused) || experience[0];
      if (!open) return self.clients.openWindow(url);

      return Promise.resolve(open.focus()).then(() => open.postMessage({ type: OPEN_MAILBOX, url }));
    })
  );
});

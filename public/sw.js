// ADR-005: Refugio's service worker. It only shows a notice and opens the mailbox when the notice is
// tapped. It has no fetch handler, so it caches nothing and never touches any other request.
//
// The notice's text comes from the server: { "title": string, "body": string, "locale": "en" | "es" }.
// It never carries letter content. The mailbox opens in the notice's locale; anything else falls
// back to English, the same default as src/lib/locale.ts (duplicated: this file isn't bundled).

const SUPPORTED_LOCALES = ["en", "es"];
const DEFAULT_LOCALE = "en";
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

  // A window already on the mailbox is reused. Any other Refugio window is left alone: the ritual
  // and its drafts live only in memory, so navigating it away would lose what someone is writing.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const onMailbox = windows.find((client) => client.url === url);
      return onMailbox ? onMailbox.focus() : self.clients.openWindow(url);
    })
  );
});

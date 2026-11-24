import "server-only";
import webpush from "web-push";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { isAllowedPushEndpoint, listPushSubscriptions, removePushEndpoint } from "@/lib/notifications/push-subscriptions";
import type { NotificationChannel } from "@/lib/notifications/notify";

// ADR-005: notices through the browsers' own push services (Apple, Google, Mozilla), signed with
// this site's VAPID keys. Free, and no third party holds Refugio's device list.

// A notice still makes sense a week late (letters live 60 days). Past that, the push service
// drops it instead of delivering it to a device that was off.
export const NOTICE_TTL_SECONDS = 7 * 24 * 60 * 60;
// Several pending notices for one device collapse into the last one, where the push service
// supports it (RFC 8030). They'd all say the same thing.
export const NOTICE_TOPIC = "mailbox";
// A push service that holds the connection open without answering must not keep the whole batch,
// and the after() task waiting on it, pending until the platform ends the invocation. This is a
// socket inactivity timeout: once it fires, web-push destroys the request and the send rejects
// like a network error (device kept, status logged as "no status").
export const PUSH_REQUEST_TIMEOUT_MS = 10_000;

// The push service's answer for a device that no longer exists.
const GONE_STATUSES = new Set([404, 410]);

// All three must be set, with the same values in Production and Preview: they share one database,
// so a device subscribed on one gets notices sent from the other. Without them nothing is sent,
// so this code can be deployed before the keys exist.
function readVapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : null;
}

export const webPushChannel: NotificationChannel = {
  name: "web-push",
  async send(identityId, noticeIn) {
    const vapidDetails = readVapidDetails();
    if (!vapidDetails) return;

    const subscriptions = await listPushSubscriptions(identityId);
    // allSettled, not all: one device failing must not end the wait for the others, since
    // after() keeps the function alive only until this promise settles.
    const results = await Promise.allSettled(
      subscriptions.map(async ({ endpoint, p256dh, auth, locale: storedLocale }) => {
        // Checked again here, not only when subscribing: the server only ever calls the
        // browsers' push services, whatever the table holds (SSRF).
        if (!isAllowedPushEndpoint(endpoint)) {
          console.error("web-push: skipped a device outside the allowed push services");
          return;
        }
        const locale = isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
        // The service worker's contract (public/sw.js): { title, body, locale }, nothing else.
        const payload = JSON.stringify({ ...noticeIn(locale), locale });

        try {
          await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload, {
            TTL: NOTICE_TTL_SECONDS,
            topic: NOTICE_TOPIC,
            timeout: PUSH_REQUEST_TIMEOUT_MS,
            vapidDetails,
          });
        } catch (error) {
          const status = statusOf(error);
          if (status !== null && GONE_STATUSES.has(status)) {
            await removePushEndpoint(endpoint);
            return;
          }
          // Only the status: the error also carries the endpoint, which identifies a device.
          console.error("web-push: a notice couldn't be delivered", status ?? "no status");
        }
      })
    );
    // Only left: removing a gone device failed. The next notice to it gets 410 again and retries.
    for (const result of results) {
      if (result.status === "rejected") console.error("web-push: couldn't remove a gone device");
    }
  },
};

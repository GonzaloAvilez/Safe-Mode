import type { Locale } from "@/lib/locale";

// ADR-005: the browser's side of letter notices. Only LetterNotificationsToggle uses it, and only
// when someone taps it: the service worker is registered the moment someone opts in, so people who
// never opt in never get one. The seal goes as a Bearer token, like /api/mailbox, and is never kept.

const SERVICE_WORKER_URL = "/sw.js";
const SUBSCRIPTION_ROUTE = "/api/notifications/subscription";

// Whether notices can be offered here.
//   available       the browser can subscribe
//   install_first   an iPhone or iPad outside the installed app: iOS only delivers web push to an
//                   app added to the Home Screen (16.4+), so the toggle says how instead
//   unavailable     no push in this browser, or no VAPID key in this deploy: nothing is offered
export type PushAvailability = "available" | "install_first" | "unavailable";

export type PushRequestFailure = "too_many" | "not_recognized" | "offline" | "failed";

export type SubscribeResult =
  | { type: "subscribed" }
  | { type: "blocked" } // the person, or the browser, said no to notices for this site
  | { type: "dismissed" } // the permission prompt was closed without an answer: nothing changed
  | { type: "failed"; reason: PushRequestFailure };

export type UnsubscribeResult = { type: "unsubscribed" } | { type: "failed"; reason: PushRequestFailure };

// Whether this seal's identity gets notices on this device. "unknown" when it couldn't be told
// (offline, rate limited, a server error): the toggle then says so and offers to ask again, rather
// than showing notices as off to someone who may have them on.
export type PushSubscriptionStatus =
  | { type: "subscribed" }
  | { type: "not_subscribed" }
  | { type: "unknown"; reason: PushRequestFailure };

// How long a newly registered service worker gets to become active. Registering can resolve before
// the worker is active, and if it never activates, `navigator.serviceWorker.ready` never settles.
export const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

// Read where it's used, as one literal: Next inlines NEXT_PUBLIC_ values at build time.
function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

function isInstalledApp(): boolean {
  const standalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// `isIos` comes from the caller (isIosDevice), so this module stays free of app code.
export function getPushAvailability({ isIos }: { isIos: boolean }): PushAvailability {
  if (typeof window === "undefined" || !vapidPublicKey()) return "unavailable";
  if (isIos && !isInstalledApp()) return "install_first";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return supported ? "available" : "unavailable";
}

// Notices were refused for this site. Only the browser's settings can undo it.
export function isPushBlocked(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "denied";
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function isSameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current || current.byteLength !== expected.byteLength) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, index) => byte === expected[index]);
}

// The push subscription this browser already holds for Refugio, without registering anything.
async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function sendWithSeal(path: string, method: "POST" | "DELETE", returnKey: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${returnKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

// The active registration, or a rejection once SERVICE_WORKER_READY_TIMEOUT_MS has passed, so a
// worker that never activates fails the subscription instead of leaving it pending.
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("service worker never became active")), SERVICE_WORKER_READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, expired]);
  } finally {
    clearTimeout(timer);
  }
}

function failureOf(response: Response | null): PushRequestFailure {
  if (!response) return "offline";
  if (response.status === 401) return "not_recognized";
  if (response.status === 429) return "too_many";
  return "failed";
}

// Must run from a tap: browsers only show the permission prompt in response to one, so it's asked
// before anything else is awaited.
export async function subscribeToPush(returnKey: string, locale: Locale): Promise<SubscribeResult> {
  const key = vapidPublicKey();
  if (!key) return { type: "failed", reason: "failed" };

  // Still the first thing awaited, so the tap counts for the prompt. A browser can reject it
  // instead of answering (#287 review): that's a failure, never an exception for the caller.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { type: "failed", reason: "failed" };
  }
  if (permission === "denied") return { type: "blocked" };
  if (permission !== "granted") return { type: "dismissed" };

  let subscription: PushSubscription;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    const registration = await activeRegistration();
    const applicationServerKey = decodeBase64Url(key);
    let existing = await registration.pushManager.getSubscription();
    // A subscription made with another key (the keys were replaced) can't receive anything signed
    // with this one, so it's replaced. Any other identity on this device is let go with it.
    if (existing && !isSameKey(existing.options.applicationServerKey, applicationServerKey)) {
      await existing.unsubscribe();
      existing = null;
    }
    subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  } catch {
    return { type: "failed", reason: "failed" };
  }

  const response = await sendWithSeal(SUBSCRIPTION_ROUTE, "POST", returnKey, { subscription: subscription.toJSON(), locale });
  return response?.ok ? { type: "subscribed" } : { type: "failed", reason: failureOf(response) };
}

// Only this identity stops getting notices here. The browser stays subscribed: another identity on
// this device may still be using the same subscription.
export async function unsubscribeFromPush(returnKey: string): Promise<UnsubscribeResult> {
  let subscription: PushSubscription | null;
  try {
    subscription = await currentSubscription();
  } catch {
    return { type: "failed", reason: "failed" };
  }
  // No subscription in this browser: nothing here can receive a notice.
  if (!subscription) return { type: "unsubscribed" };

  const response = await sendWithSeal(SUBSCRIPTION_ROUTE, "DELETE", returnKey, { endpoint: subscription.endpoint });
  return response?.ok ? { type: "unsubscribed" } : { type: "failed", reason: failureOf(response) };
}

// Whether this seal's identity gets notices on this device. With no subscription in this browser,
// it's certainly not: nothing is registered or asked.
export async function getPushSubscriptionStatus(returnKey: string): Promise<PushSubscriptionStatus> {
  let subscription: PushSubscription | null;
  try {
    subscription = await currentSubscription();
  } catch {
    return { type: "unknown", reason: "failed" };
  }
  if (!subscription) return { type: "not_subscribed" };

  const response = await sendWithSeal(`${SUBSCRIPTION_ROUTE}/status`, "POST", returnKey, { endpoint: subscription.endpoint });
  if (!response?.ok) return { type: "unknown", reason: failureOf(response) };
  try {
    const body: unknown = await response.json();
    const subscribed = typeof body === "object" && body !== null ? (body as { subscribed?: unknown }).subscribed : undefined;
    if (subscribed === true) return { type: "subscribed" };
    if (subscribed === false) return { type: "not_subscribed" };
  } catch {
    // An answer that isn't JSON tells nothing either.
  }
  return { type: "unknown", reason: "failed" };
}

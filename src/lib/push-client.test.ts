// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SERVICE_WORKER_READY_TIMEOUT_MS,
  getPushAvailability,
  getPushSubscriptionStatus,
  isPushBlocked,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

const SEAL = "482133901756229";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
// Any base64url value works as the key here; what matters is that it's compared byte by byte.
const VAPID_PUBLIC_KEY = "BOurom9kflp01No-zioM65hciEAM-MMRCQa7ay_DYcyWH5WaXuRf5Dt13EGdKGZhxZV4eZPWKu2UVtNxoeh-eak";
const keyBytes = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)), (c) => c.charCodeAt(0));

type FakeSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
};

function fakeSubscription(key = VAPID_PUBLIC_KEY, endpoint = ENDPOINT): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: keyBytes(key).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let serviceWorker: { register: ReturnType<typeof vi.fn>; getRegistration: ReturnType<typeof vi.fn>; ready: Promise<unknown> };
let fetchMock: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY);
  pushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(fakeSubscription()) };
  const registration = { pushManager };
  serviceWorker = {
    register: vi.fn().mockResolvedValue(registration),
    getRegistration: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
  };
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
  permission = "default";
  requestPermission = vi.fn(async () => permission);
  const FakeNotification = Object.assign(function Notification() {}, { requestPermission });
  Object.defineProperty(FakeNotification, "permission", { get: () => permission });
  vi.stubGlobal("Notification", FakeNotification);
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "PushManager");
});

function requestTo(index = 0) {
  const [path, init] = fetchMock.mock.calls[index];
  return { path, method: init.method, authorization: init.headers.Authorization, body: JSON.parse(init.body) };
}

describe("getPushAvailability", () => {
  it("is available where the browser can subscribe", () => {
    expect(getPushAvailability({ isIos: false })).toBe("available");
  });

  it("offers nothing while this deploy has no VAPID key", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(getPushAvailability({ isIos: false })).toBe("unavailable");
  });

  it("offers nothing in a browser without push", () => {
    Reflect.deleteProperty(window, "PushManager");
    expect(getPushAvailability({ isIos: false })).toBe("unavailable");
  });

  // iOS only delivers web push to an app added to the Home Screen.
  it("asks an iPhone outside the installed app to install it first, even without PushManager", () => {
    Reflect.deleteProperty(window, "PushManager");
    expect(getPushAvailability({ isIos: true })).toBe("install_first");
  });

  it("is available on an iPhone inside the installed app", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(getPushAvailability({ isIos: true })).toBe("available");
    Reflect.deleteProperty(navigator, "standalone");
  });
});

describe("isPushBlocked", () => {
  it.each([
    ["denied", true],
    ["default", false],
    ["granted", false],
  ] as const)("is %s → %s", (state, blocked) => {
    permission = state;
    expect(isPushBlocked()).toBe(blocked);
  });
});

describe("subscribeToPush", () => {
  it("asks permission first, registers the worker, subscribes with the site's key, and tells the server with the seal", async () => {
    permission = "granted";

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "subscribed" });

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    expect(requestTo()).toEqual({
      path: "/api/notifications/subscription",
      method: "POST",
      authorization: `Bearer ${SEAL}`,
      body: { subscription: { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }, locale: "es" },
    });
  });

  it("reuses the subscription this browser already holds for the same key", async () => {
    permission = "granted";
    pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());

    expect(await subscribeToPush(SEAL, "en")).toEqual({ type: "subscribed" });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("replaces a subscription made with another key, which could never receive these notices", async () => {
    permission = "granted";
    const stale = fakeSubscription("AAAA");
    pushManager.getSubscription.mockResolvedValueOnce(stale);

    expect(await subscribeToPush(SEAL, "en")).toEqual({ type: "subscribed" });
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("registers nothing and sends nothing when notices are refused", async () => {
    permission = "denied";

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "blocked" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // #287 review: a browser can reject the permission request instead of answering it.
  it("fails, registering and sending nothing, when the browser rejects the permission request", async () => {
    requestPermission.mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError"));

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "failed", reason: "failed" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changes nothing when the prompt is closed without an answer", async () => {
    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "dismissed" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Registering can resolve before the worker is active; one that never activates must not leave
  // the toggle waiting forever.
  it("fails, without subscribing or telling the server, when the worker never becomes active", async () => {
    vi.useFakeTimers();
    permission = "granted";
    serviceWorker.ready = new Promise(() => {});

    const result = subscribeToPush(SEAL, "es");
    await vi.advanceTimersByTimeAsync(SERVICE_WORKER_READY_TIMEOUT_MS);

    expect(await result).toEqual({ type: "failed", reason: "failed" });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("fails without telling the server when the browser can't subscribe", async () => {
    permission = "granted";
    pushManager.subscribe.mockRejectedValueOnce(new Error("push service error"));

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "failed", reason: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "not_recognized"],
    [429, "too_many"],
    [400, "failed"],
    [500, "failed"],
  ] as const)("reports a %s from the server as %s", async (status, reason) => {
    permission = "granted";
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "failed", reason });
  });

  it("reports being offline", async () => {
    permission = "granted";
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    expect(await subscribeToPush(SEAL, "es")).toEqual({ type: "failed", reason: "offline" });
  });
});

describe("unsubscribeFromPush", () => {
  // Another identity on this device may still be using the same subscription.
  it("removes only this identity's row and never unsubscribes the browser", async () => {
    const subscription = fakeSubscription();
    pushManager.getSubscription.mockResolvedValueOnce(subscription);

    expect(await unsubscribeFromPush(SEAL)).toEqual({ type: "unsubscribed" });
    expect(requestTo()).toEqual({
      path: "/api/notifications/subscription",
      method: "DELETE",
      authorization: `Bearer ${SEAL}`,
      body: { endpoint: ENDPOINT },
    });
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it("has nothing to remove when this browser holds no subscription", async () => {
    serviceWorker.getRegistration.mockResolvedValueOnce(undefined);

    expect(await unsubscribeFromPush(SEAL)).toEqual({ type: "unsubscribed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failure from the server", async () => {
    pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));

    expect(await unsubscribeFromPush(SEAL)).toEqual({ type: "failed", reason: "too_many" });
  });
});

describe("getPushSubscriptionStatus", () => {
  it("asks the server about this device's subscription, with the seal", async () => {
    pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    fetchMock.mockResolvedValueOnce(Response.json({ subscribed: true }));

    expect(await getPushSubscriptionStatus(SEAL)).toEqual({ type: "subscribed" });
    expect(requestTo()).toEqual({
      path: "/api/notifications/subscription/status",
      method: "POST",
      authorization: `Bearer ${SEAL}`,
      body: { endpoint: ENDPOINT },
    });
  });

  it("is not subscribed when the server says so", async () => {
    pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    fetchMock.mockResolvedValueOnce(Response.json({ subscribed: false }));

    expect(await getPushSubscriptionStatus(SEAL)).toEqual({ type: "not_subscribed" });
  });

  // People who never opted in never get a service worker, not even from checking.
  it("is certainly not subscribed without a subscription, without registering anything or asking the server", async () => {
    serviceWorker.getRegistration.mockResolvedValueOnce(undefined);

    expect(await getPushSubscriptionStatus(SEAL)).toEqual({ type: "not_subscribed" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Someone who has notices on must never see them as off just because the check failed.
  it.each([
    ["offline", () => Promise.reject(new TypeError("Failed to fetch")), "offline"],
    ["rate limited", () => Promise.resolve(new Response(null, { status: 429 })), "too_many"],
    ["a server error", () => Promise.resolve(new Response(null, { status: 500 })), "failed"],
    ["an unknown seal", () => Promise.resolve(new Response(null, { status: 401 })), "not_recognized"],
    ["an answer that isn't JSON", () => Promise.resolve(new Response("nope", { status: 200 })), "failed"],
    ["an answer without a yes or no", () => Promise.resolve(Response.json({})), "failed"],
  ] as const)("is unknown, not off, when %s", async (_, answer, reason) => {
    pushManager.getSubscription.mockResolvedValueOnce(fakeSubscription());
    fetchMock.mockImplementationOnce(answer);

    expect(await getPushSubscriptionStatus(SEAL)).toEqual({ type: "unknown", reason });
  });

  it("is unknown when the browser can't say which subscription it holds", async () => {
    serviceWorker.getRegistration.mockRejectedValueOnce(new Error("storage error"));

    expect(await getPushSubscriptionStatus(SEAL)).toEqual({ type: "unknown", reason: "failed" });
  });
});

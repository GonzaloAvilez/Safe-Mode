import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// public/sw.js isn't bundled or imported anywhere, so it's run here the way a browser runs it:
// as a plain script against a `self` that collects its event listeners.
const SOURCE = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://refugiospace.com";

type Listener = (event: Record<string, unknown>) => void;
type WindowClient = {
  url: string;
  focused?: boolean;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function windowAt(url: string, focused = false): WindowClient {
  return { url, focused, focus: vi.fn(async () => undefined), postMessage: vi.fn() };
}

function loadWorker(windows: WindowClient[] = []) {
  const listeners = new Map<string, Listener>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  };
  runInNewContext(SOURCE, { self, URL });

  // Dispatches like the browser does, and waits for whatever the listener passed to waitUntil.
  async function dispatch(type: string, event: Record<string, unknown> = {}) {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  }

  return { self, dispatch };
}

function pushEvent(payload: unknown) {
  return {
    data:
      payload === undefined
        ? null
        : { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) },
  };
}

function shownNotice(self: ReturnType<typeof loadWorker>["self"]) {
  const [title, options] = self.registration.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
  return { title, options };
}

describe("service worker: push", () => {
  it("shows the server's notice, which opens the mailbox in its locale", async () => {
    const { self, dispatch } = loadWorker();

    await dispatch("push", pushEvent({ title: "Refugio", body: "Tienes una carta esperándote.", locale: "es" }));

    const { title, options } = shownNotice(self);
    expect(title).toBe("Refugio");
    expect(options).toMatchObject({
      body: "Tienes una carta esperándote.",
      icon: "/icons/icon-192.png",
      tag: "mailbox",
      data: { url: "/es/mailbox" },
    });
  });

  it.each([
    ["an unsupported locale", { title: "T", body: "B", locale: "fr" }],
    ["no locale", { title: "T", body: "B" }],
  ])("opens the English mailbox for %s", async (_, payload) => {
    const { self, dispatch } = loadWorker();

    await dispatch("push", pushEvent(payload));

    expect(shownNotice(self).options.data).toEqual({ url: "/en/mailbox" });
  });

  // Every push must show something, or the browser shows its own generic notice.
  it.each([
    ["no payload", undefined],
    ["a payload that isn't JSON", "not json"],
    ["a payload that isn't an object", "42"],
    ["a null payload", "null"],
    ["an empty title", { title: "", body: 7 }],
  ])("still shows a notice for %s", async (_, payload) => {
    const { self, dispatch } = loadWorker();

    await dispatch("push", pushEvent(payload));

    const { title, options } = shownNotice(self);
    expect(title).toBe("Refugio");
    expect(options.body).toBe("");
    expect(options.data).toEqual({ url: "/en/mailbox" });
  });
});

describe("service worker: tapping the notice", () => {
  function tap(url?: string) {
    const close = vi.fn();
    return { close, event: { notification: { close, data: url ? { url } : undefined } } };
  }

  it("opens a window when no Refugio window is open", async () => {
    const { self, dispatch } = loadWorker();
    const { close, event } = tap("/es/mailbox");

    await dispatch("notificationclick", event);

    expect(close).toHaveBeenCalledOnce();
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/es/mailbox`);
  });

  it("focuses a window already on the mailbox instead of opening another", async () => {
    const mailbox = windowAt(`${ORIGIN}/es/mailbox`);
    const { self, dispatch } = loadWorker([mailbox]);

    await dispatch("notificationclick", tap("/es/mailbox").event);

    expect(mailbox.focus).toHaveBeenCalledOnce();
    expect(mailbox.postMessage).not.toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  // The heart of it: the ritual and its drafts live only in memory. `clients.openWindow()` does
  // not promise a *new* window — an installed app can have its standalone window reused — so with
  // any Refugio window open it is never called. The window is focused and told why instead.
  describe("with a Refugio window open somewhere else", () => {
    it("never calls openWindow, which could navigate that window away from a draft", async () => {
      const writing = windowAt(`${ORIGIN}/es/write`);
      const { self, dispatch } = loadWorker([writing]);

      await dispatch("notificationclick", tap("/es/mailbox").event);

      expect(self.clients.openWindow).not.toHaveBeenCalled();
    });

    it("focuses it and sends the mailbox intent, instead of navigating it", async () => {
      const writing = windowAt(`${ORIGIN}/es/write`);
      const { dispatch } = loadWorker([writing]);

      await dispatch("notificationclick", tap("/es/mailbox").event);

      expect(writing.focus).toHaveBeenCalledOnce();
      expect(writing.postMessage).toHaveBeenCalledWith({
        type: "refugio:open-mailbox",
        url: `${ORIGIN}/es/mailbox`,
      });
    });

    it("never navigates it, whatever the browser offers", async () => {
      const writing = { ...windowAt(`${ORIGIN}/es/write`), navigate: vi.fn() };
      const { dispatch } = loadWorker([writing]);

      await dispatch("notificationclick", tap("/es/mailbox").event);

      expect(writing.navigate).not.toHaveBeenCalled();
    });

    it("prefers the focused window when several are open", async () => {
      const background = windowAt(`${ORIGIN}/es/write`);
      const front = windowAt(`${ORIGIN}/es/observe`, true);
      const { dispatch } = loadWorker([background, front]);

      await dispatch("notificationclick", tap("/es/mailbox").event);

      expect(front.postMessage).toHaveBeenCalledOnce();
      expect(background.postMessage).not.toHaveBeenCalled();
    });

    // The mailbox itself still wins: it's already where the tap wanted to go.
    it("still prefers a window already on the mailbox over a focused one", async () => {
      const front = windowAt(`${ORIGIN}/es/write`, true);
      const mailbox = windowAt(`${ORIGIN}/es/mailbox`);
      const { self, dispatch } = loadWorker([front, mailbox]);

      await dispatch("notificationclick", tap("/es/mailbox").event);

      expect(mailbox.focus).toHaveBeenCalledOnce();
      expect(front.focus).not.toHaveBeenCalled();
      expect(self.clients.openWindow).not.toHaveBeenCalled();
    });
  });

  it("opens the English mailbox when the notice carries no url", async () => {
    const { self, dispatch } = loadWorker();

    await dispatch("notificationclick", tap().event);

    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/en/mailbox`);
  });
});

describe("service worker: lifecycle", () => {
  it("takes over right away, so a fixed worker reaches people on their next visit", async () => {
    const { self, dispatch } = loadWorker();

    await dispatch("install");
    await dispatch("activate");

    expect(self.skipWaiting).toHaveBeenCalledOnce();
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });

  it("has no fetch handler, so it never caches or touches another request", () => {
    expect(SOURCE).not.toMatch(/addEventListener\(\s*["']fetch["']/);
  });
});

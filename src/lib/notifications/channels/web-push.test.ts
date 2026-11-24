import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotificationMock, listMock, removeEndpointMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  listMock: vi.fn(),
  removeEndpointMock: vi.fn(),
}));

vi.mock("web-push", () => ({ default: { sendNotification: sendNotificationMock } }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/notifications/push-subscriptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/push-subscriptions")>()),
  listPushSubscriptions: listMock,
  removePushEndpoint: removeEndpointMock,
}));

const { webPushChannel, NOTICE_TOPIC, NOTICE_TTL_SECONDS, PUSH_REQUEST_TIMEOUT_MS } = await import("@/lib/notifications/channels/web-push");

const IDENTITY = "identity-1";
const VAPID = { publicKey: "public-key", privateKey: "private-key", subject: "https://refugiospace.com" };
const phone = { endpoint: "https://fcm.googleapis.com/fcm/send/phone", p256dh: "p1", auth: "a1", locale: "es" };
const laptop = { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/laptop", p256dh: "p2", auth: "a2", locale: "en" };

const noticeIn = (locale: string) => ({ title: "Refugio", body: `body-${locale}` });

function pushError(statusCode: number) {
  return Object.assign(new Error("push service error"), { statusCode, endpoint: phone.endpoint, body: "" });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", VAPID.privateKey);
  vi.stubEnv("VAPID_SUBJECT", VAPID.subject);
  sendNotificationMock.mockResolvedValue({ statusCode: 201 });
  removeEndpointMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("webPushChannel", () => {
  it("sends each device its notice in its own locale, with the 7-day TTL and the mailbox topic", async () => {
    listMock.mockResolvedValueOnce([phone, laptop]);

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(listMock).toHaveBeenCalledWith(IDENTITY);
    const options = { TTL: NOTICE_TTL_SECONDS, topic: NOTICE_TOPIC, timeout: PUSH_REQUEST_TIMEOUT_MS, vapidDetails: VAPID };
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: phone.endpoint, keys: { p256dh: "p1", auth: "a1" } },
      JSON.stringify({ title: "Refugio", body: "body-es", locale: "es" }),
      options
    );
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: laptop.endpoint, keys: { p256dh: "p2", auth: "a2" } },
      JSON.stringify({ title: "Refugio", body: "body-en", locale: "en" }),
      options
    );
    expect(NOTICE_TTL_SECONDS).toBe(604800);
    expect(NOTICE_TOPIC).toBe("mailbox");
    expect(PUSH_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  // The service worker's whole contract: no other field can ride along, letter text included.
  it("sends exactly { title, body, locale } and nothing else", async () => {
    listMock.mockResolvedValueOnce([phone]);

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(Object.keys(JSON.parse(sendNotificationMock.mock.calls[0][1]))).toEqual(["title", "body", "locale"]);
  });

  it("writes in English to a device stored with a locale it no longer supports", async () => {
    listMock.mockResolvedValueOnce([{ ...phone, locale: "fr" }]);

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(JSON.parse(sendNotificationMock.mock.calls[0][1])).toEqual({ title: "Refugio", body: "body-en", locale: "en" });
  });

  it.each(["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])(
    "sends nothing, and reads no devices, while %s is missing",
    async (name) => {
      vi.stubEnv(name, "");

      await webPushChannel.send(IDENTITY, noticeIn);

      expect(listMock).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    }
  );

  it.each([404, 410])("removes a device the push service says is gone (%s), for every identity on it", async (status) => {
    listMock.mockResolvedValueOnce([phone, laptop]);
    sendNotificationMock.mockImplementation(async ({ endpoint }) => {
      if (endpoint === phone.endpoint) throw pushError(status);
      return { statusCode: 201 };
    });

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(removeEndpointMock).toHaveBeenCalledOnce();
    expect(removeEndpointMock).toHaveBeenCalledWith(phone.endpoint);
  });

  it.each([400, 413, 429, 500, 503])("keeps the device after a %s, and logs only the status", async (status) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listMock.mockResolvedValueOnce([phone]);
    sendNotificationMock.mockRejectedValueOnce(pushError(status));

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(removeEndpointMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("web-push: a notice couldn't be delivered", status);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(phone.endpoint);
    consoleError.mockRestore();
  });

  // web-push's own timeout error: a stalled push service settles like a network failure, and the
  // other devices still get theirs.
  it("lets a timed-out request settle without the device being removed, and still delivers to the others", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listMock.mockResolvedValueOnce([phone, laptop]);
    sendNotificationMock.mockImplementation(async ({ endpoint }) => {
      if (endpoint === phone.endpoint) throw new Error("Socket timeout");
      return { statusCode: 201 };
    });

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(removeEndpointMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("web-push: a notice couldn't be delivered", "no status");
    consoleError.mockRestore();
  });

  it("keeps the device after an error with no status (network failure)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listMock.mockResolvedValueOnce([phone]);
    sendNotificationMock.mockRejectedValueOnce(new Error("socket hang up"));

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(removeEndpointMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("web-push: a notice couldn't be delivered", "no status");
    consoleError.mockRestore();
  });

  it("still delivers to the other devices when one fails, and waits for all of them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listMock.mockResolvedValueOnce([phone, laptop]);
    let laptopDone = false;
    sendNotificationMock.mockImplementation(async ({ endpoint }) => {
      if (endpoint === phone.endpoint) throw pushError(410);
      await new Promise((resolve) => setTimeout(resolve, 5));
      laptopDone = true;
      return { statusCode: 201 };
    });
    removeEndpointMock.mockRejectedValueOnce(new Error("database down"));

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(laptopDone).toBe(true);
    expect(consoleError).toHaveBeenCalledWith("web-push: couldn't remove a gone device");
    consoleError.mockRestore();
  });

  // SSRF: whatever the table holds, the server only ever calls the browsers' push services.
  it("never sends to a stored endpoint outside the push services, and still sends to the others", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = { ...phone, endpoint: "https://10.0.0.1/internal" };
    listMock.mockResolvedValueOnce([internal, laptop]);

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(sendNotificationMock).toHaveBeenCalledOnce();
    expect(sendNotificationMock.mock.calls[0][0].endpoint).toBe(laptop.endpoint);
    expect(removeEndpointMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("web-push: skipped a device outside the allowed push services");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("10.0.0.1");
    consoleError.mockRestore();
  });

  it("sends nothing to an identity with no devices", async () => {
    listMock.mockResolvedValueOnce([]);

    await webPushChannel.send(IDENTITY, noticeIn);

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

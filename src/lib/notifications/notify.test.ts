import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@/lib/notifications/channels/web-push", () => ({
  webPushChannel: { name: "web-push", send: sendMock },
}));

const { notify } = await import("@/lib/notifications/notify");

afterEach(() => {
  vi.resetAllMocks();
});

describe("notify", () => {
  it("hands every channel the identity and the event's fixed notice, per locale", async () => {
    sendMock.mockResolvedValueOnce(undefined);

    await notify("identity-1", "letter_delivered");

    expect(sendMock).toHaveBeenCalledWith("identity-1", expect.any(Function));
    const noticeIn = sendMock.mock.calls[0][1];
    expect(noticeIn("es")).toEqual({ title: "Refugio", body: "Alguien te escribió una carta." });
    expect(noticeIn("en")).toEqual({ title: "Refugio", body: "Someone wrote you a letter." });
  });

  // The caller's work (a delivered letter) must never be undone by a notice.
  it("never rejects when a channel fails, and logs no details beyond the error's kind", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new TypeError("https://push.example/device-1 refused"));

    await expect(notify("identity-1", "letter_delivered")).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("notify: the web-push channel failed", "TypeError");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("push.example");
    consoleError.mockRestore();
  });
});

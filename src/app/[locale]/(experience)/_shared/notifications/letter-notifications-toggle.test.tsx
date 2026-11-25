// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const { availabilityMock, blockedMock, isSubscribedMock, subscribeMock, unsubscribeMock, isIosMock } = vi.hoisted(() => ({
  availabilityMock: vi.fn(),
  blockedMock: vi.fn(),
  isSubscribedMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  isIosMock: vi.fn(),
}));

vi.mock("@/lib/push-client", () => ({
  getPushAvailability: availabilityMock,
  isPushBlocked: blockedMock,
  isSubscribedToPush: isSubscribedMock,
  subscribeToPush: subscribeMock,
  unsubscribeFromPush: unsubscribeMock,
}));
vi.mock("../return-key/download-blob", () => ({ isIosDevice: isIosMock }));

import { LetterNotificationsToggle } from "./letter-notifications-toggle";

const SEAL = "482133901756229";
const T = es.letterNotifications;

function renderToggle(locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <LetterNotificationsToggle returnKey={SEAL} />
    </NextIntlClientProvider>
  );
}

// Lets the status check (and any request a click started) finish.
const settle = () => act(async () => {});

beforeEach(() => {
  availabilityMock.mockReturnValue("available");
  blockedMock.mockReturnValue(false);
  isSubscribedMock.mockResolvedValue(false);
  subscribeMock.mockResolvedValue({ type: "subscribed" });
  unsubscribeMock.mockResolvedValue({ type: "unsubscribed" });
  isIosMock.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("LetterNotificationsToggle", () => {
  it("offers notices, off by default, saying they're only for this device and never say what was written", async () => {
    renderToggle();
    await settle();

    const button = screen.getByRole("button", { name: T.turnOn });
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(T.hint)).toBeTruthy();
    expect(isSubscribedMock).toHaveBeenCalledWith(SEAL);
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("shows notices as on when this identity already gets them on this device", async () => {
    isSubscribedMock.mockResolvedValueOnce(true);
    renderToggle();
    await settle();

    expect(screen.getByText(T.on)).toBeTruthy();
    expect(screen.getByRole("button", { name: T.turnOff })).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.turnOn })).toBeNull();
  });

  it("offers nothing where notices can't be offered", async () => {
    availabilityMock.mockReturnValue("unavailable");
    const { container } = renderToggle();
    await settle();

    expect(container.textContent).toBe("");
    expect(isSubscribedMock).not.toHaveBeenCalled();
  });

  // iOS only delivers web push to an app added to the Home Screen.
  it("tells an iPhone outside the installed app how to install it, and nothing more", async () => {
    isIosMock.mockReturnValue(true);
    availabilityMock.mockImplementation(({ isIos }: { isIos: boolean }) => (isIos ? "install_first" : "available"));
    renderToggle();
    await settle();

    expect(screen.getByText(T.installFirst)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(isSubscribedMock).not.toHaveBeenCalled();
  });

  it("says notices are blocked when the browser already refused them", async () => {
    blockedMock.mockReturnValue(true);
    renderToggle();
    await settle();

    expect(screen.getByText(T.blocked)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("turns notices on with the seal, in the page's language", async () => {
    renderToggle("en");
    await settle();

    fireEvent.click(screen.getByRole("button", { name: en.letterNotifications.turnOn }));
    await settle();

    expect(subscribeMock).toHaveBeenCalledWith(SEAL, "en");
    expect(screen.getByText(en.letterNotifications.on)).toBeTruthy();
  });

  it("can't be pressed twice while turning on", async () => {
    let finish!: (value: unknown) => void;
    subscribeMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOn }));
    const busy = screen.getByRole("button", { name: T.turningOn }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);

    await act(async () => finish({ type: "subscribed" }));
    expect(subscribeMock).toHaveBeenCalledOnce();
  });

  it("says notices are blocked when the person refuses the prompt", async () => {
    subscribeMock.mockResolvedValueOnce({ type: "blocked" });
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOn }));
    await settle();

    expect(screen.getByText(T.blocked)).toBeTruthy();
  });

  it("stays off, without a message, when the prompt is closed without an answer", async () => {
    subscribeMock.mockResolvedValueOnce({ type: "dismissed" });
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOn }));
    await settle();

    expect(screen.getByRole("button", { name: T.turnOn })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it.each([
    ["failed", T.turnOnFailed],
    ["not_recognized", T.turnOnFailed],
    ["too_many", es.letterNotice.tooMany],
    ["offline", es.common.errors.couldntConnect],
  ])("stays off and says why when turning on fails (%s)", async (reason, text) => {
    subscribeMock.mockResolvedValueOnce({ type: "failed", reason });
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOn }));
    await settle();

    expect(screen.getByRole("button", { name: T.turnOn })).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("turns notices off for this identity only", async () => {
    isSubscribedMock.mockResolvedValueOnce(true);
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOff }));
    await settle();

    expect(unsubscribeMock).toHaveBeenCalledWith(SEAL);
    expect(screen.getByRole("button", { name: T.turnOn })).toBeTruthy();
  });

  it("stays on and says so when turning off fails", async () => {
    isSubscribedMock.mockResolvedValueOnce(true);
    unsubscribeMock.mockResolvedValueOnce({ type: "failed", reason: "failed" });
    renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOff }));
    await settle();

    expect(screen.getByText(T.on)).toBeTruthy();
    expect(screen.getByText(T.turnOffFailed)).toBeTruthy();
  });

  // Leaving the closing mid-request: the answer has nowhere to go, and nothing breaks.
  it("lets an answer that arrives after it's gone go", async () => {
    let finish!: (value: unknown) => void;
    subscribeMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const consoleError = vi.spyOn(console, "error");
    const view = renderToggle();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: T.turnOn }));
    view.unmount();
    await act(async () => finish({ type: "subscribed" }));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

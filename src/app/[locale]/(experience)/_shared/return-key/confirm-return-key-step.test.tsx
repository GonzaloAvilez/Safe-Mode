// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import { useLocaleTransition } from "@/app/_components/experience-state/locale-transition";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const { confirmMock, pickMock } = vi.hoisted(() => ({ confirmMock: vi.fn(), pickMock: vi.fn() }));

vi.mock("./confirm-return-key", () => ({ confirmReturnKey: confirmMock }));
vi.mock("@/lib/return-key-groups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-groups")>()),
  pickAskedGroup: pickMock,
}));

import { ConfirmReturnKeyStep, LIT_LIGHT_HOLD_MS } from "./confirm-return-key-step";

// The step's contract with whichever screen shows it (Leave a Trace today, Mirror next): the
// screen's own words go in, and what happens next comes back through the callbacks. The ritual
// itself (lights, digits, retries) is covered through Leave a Trace in seal-trace-step.test.tsx.

const SEAL = "482133901756229";
const MIDDLE_GROUP = "39017";
const C = es.returnKey.confirm;
const PROPS = {
  returnKey: SEAL,
  hint: "Con las tres luces encendidas, escribes tu carta.",
  failedMessage: "No pudimos confirmar tu sello.",
  leaveLabel: "Volver a su frase",
};

const callbacks = { onConfirmed: vi.fn(), onSeeSealAgain: vi.fn(), onLeave: vi.fn() };

function LockedReadout() {
  const { locked } = useLocaleTransition();
  return (
    <div hidden>
      <output data-testid="locked">{String(locked)}</output>
    </div>
  );
}

function renderConfirm(previouslyAsked: 0 | 1 | 2 | null = null, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <ExperienceProviders>
        <ConfirmReturnKeyStep {...PROPS} {...callbacks} previouslyAsked={previouslyAsked} />
        <LockedReadout />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

const field = () => screen.getByPlaceholderText("00000") as HTMLInputElement;
const lightButton = () => screen.getByRole("button", { name: C.submit });

async function typeAndLight(group: string) {
  fireEvent.change(field(), { target: { value: group } });
  fireEvent.click(lightButton());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LIT_LIGHT_HOLD_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  pickMock.mockReturnValue(1);
  confirmMock.mockResolvedValue({ type: "confirmed" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ConfirmReturnKeyStep", () => {
  it("shows the screen's own hint and way out, with the shared headline and question", () => {
    renderConfirm();

    expect(screen.getByText(PROPS.hint)).toBeTruthy();
    expect(screen.getByRole("button", { name: PROPS.leaveLabel })).toBeTruthy();
    expect(screen.getByText(C.headline)).toBeTruthy();
    expect(screen.getByText(C.ask.middle)).toBeTruthy();
  });

  it("speaks English with an English visitor", () => {
    renderConfirm(null, "en");

    expect(screen.getByText(en.returnKey.confirm.headline)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.returnKey.confirm.submit })).toBeTruthy();
  });

  it("asks a group other than the one asked before", () => {
    renderConfirm(2);

    expect(pickMock).toHaveBeenCalledWith(2);
  });

  it("calls onConfirmed once the seal is confirmed and the light has stayed on, and never before", async () => {
    renderConfirm();
    fireEvent.change(field(), { target: { value: MIDDLE_GROUP } });
    fireEvent.click(lightButton());
    await act(async () => {});

    expect(confirmMock).toHaveBeenCalledWith(SEAL);
    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByTestId("locked").textContent).toBe("true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIT_LIGHT_HOLD_MS);
    });
    expect(callbacks.onConfirmed).toHaveBeenCalledOnce();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("never calls onConfirmed for a wrong group, and confirms nothing", async () => {
    renderConfirm();

    await typeAndLight("48213");

    expect(screen.getByRole("status").textContent).toBe(C.wrong);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", PROPS.failedMessage],
    ["too_many", C.tooMany],
    ["offline", es.common.errors.couldntConnect],
  ] as const)("when the server answers %s, says so and never calls onConfirmed", async (reason, message) => {
    confirmMock.mockResolvedValue({ type: "error", reason });
    renderConfirm();

    await typeAndLight(MIDDLE_GROUP);

    expect(screen.getByRole("status").textContent).toBe(message);
    expect(callbacks.onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("hands back the group it asked for when the person goes to see the seal again", () => {
    pickMock.mockReturnValue(2);
    renderConfirm();

    fireEvent.click(screen.getByRole("button", { name: C.back }));

    expect(callbacks.onSeeSealAgain).toHaveBeenCalledWith(2);
    expect(callbacks.onLeave).not.toHaveBeenCalled();
  });

  it("calls onLeave from the way out, confirming nothing", () => {
    renderConfirm();

    fireEvent.click(screen.getByRole("button", { name: PROPS.leaveLabel }));

    expect(callbacks.onLeave).toHaveBeenCalledOnce();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("lets nobody leave or go back while the light is lighting", async () => {
    let answer!: (result: { type: "confirmed" }) => void;
    confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderConfirm();
    fireEvent.change(field(), { target: { value: MIDDLE_GROUP } });
    fireEvent.click(lightButton());

    expect((screen.getByRole("button", { name: PROPS.leaveLabel }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: C.back }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => answer({ type: "confirmed" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIT_LIGHT_HOLD_MS);
    });
  });
});

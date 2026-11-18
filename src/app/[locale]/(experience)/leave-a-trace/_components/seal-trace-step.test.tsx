// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { confirmMock, pickMock } = vi.hoisted(() => ({ confirmMock: vi.fn(), pickMock: vi.fn() }));

vi.mock("./confirm-return-key", () => ({ confirmReturnKey: confirmMock }));
vi.mock("@/lib/return-key-groups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/return-key-groups")>()),
  pickAskedGroup: pickMock,
}));

import { LIT_LIGHT_HOLD_MS, SealTraceStep } from "./seal-trace-step";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

const S = es.leaveATrace.seal;
const GROUPS = ["48213", "39017", "56229"];
const SEALING = { phase: "sealing" as const, key: { returnKey: SEAL, sentence: SENTENCE } };

const state = (id: string) => screen.getByTestId(id).textContent;
const lights = () => [...document.querySelectorAll("[data-light]")].map((light) => light.getAttribute("data-light"));
const field = () => screen.getByPlaceholderText("00000") as HTMLInputElement;
const light = () => screen.getByRole("button", { name: S.submit }) as HTMLButtonElement;

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

async function holdElapses() {
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

describe("SealTraceStep", () => {
  it.each([
    [0, S.ask.first, S.field.first, ["off", "on", "on"]],
    [1, S.ask.middle, S.field.middle, ["on", "off", "on"]],
    [2, S.ask.last, S.field.last, ["on", "on", "off"]],
  ] as const)("asking for group %s: that light is off, and the question names it", (asked, question, label, expected) => {
    pickMock.mockReturnValue(asked);

    renderStep(<SealTraceStep />, SEALING);

    expect(lights()).toEqual(expected);
    expect(screen.getByText(S.headline)).toBeTruthy();
    expect(screen.getByText(question)).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("asks a group other than the last one asked, after looking at the seal again", () => {
    renderStep(<SealTraceStep />, { ...SEALING, lastAsked: 2 });

    expect(pickMock).toHaveBeenCalledWith(2);
  });

  it("accepts only digits, five at most, and can't light before all five are there", () => {
    renderStep(<SealTraceStep />, SEALING);

    type("39 0a1");
    expect(field().value).toBe("3901");
    expect(light().disabled).toBe(true);

    type("3901788");
    expect(field().value).toBe("39017");
    expect(light().disabled).toBe(false);
  });

  it("a wrong group is not punished: it says so, sends nothing, and the light stays off", () => {
    renderStep(<SealTraceStep />, SEALING);

    type(GROUPS[0]); // a real group of the seal, but not the one asked
    fireEvent.click(light());

    expect(screen.getByRole("status").textContent).toBe(S.wrong);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(lights()).toEqual(["on", "off", "on"]);
    expect(state("phase")).toBe("sealing");

    type("3901");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("the right group lights the missing light at once and confirms the whole seal", async () => {
    renderStep(<SealTraceStep />, SEALING);

    type(GROUPS[1]);
    fireEvent.click(light());

    expect(lights()).toEqual(["on", "on", "on"]);
    expect(screen.getByRole("status").textContent).toBe(S.lit);
    expect(confirmMock).toHaveBeenCalledWith(SEAL);
    await act(async () => {});
    expect(state("locked")).toBe("true");
  });

  it("the light stays on a moment before the closing, even if the server answers at once", async () => {
    renderStep(<SealTraceStep />, SEALING);
    type(GROUPS[1]);
    fireEvent.click(light());
    await act(async () => {});

    expect(state("phase")).toBe("sealing");

    await holdElapses();
    expect(state("phase")).toBe("sealed");
    expect(state("key")).toBe("");
    expect(state("lastAsked")).toBe("");
    expect(state("locked")).toBe("false");
  });

  it("waits for the server when it takes longer than the light's moment", async () => {
    let answer!: (result: { type: "confirmed" }) => void;
    confirmMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderStep(<SealTraceStep />, SEALING);
    type(GROUPS[1]);
    fireEvent.click(light());

    await holdElapses();
    expect(state("phase")).toBe("sealing");

    await act(async () => answer({ type: "confirmed" }));
    expect(state("phase")).toBe("sealed");
  });

  it("sends once however many times it's pressed while the light is lighting", async () => {
    renderStep(<SealTraceStep />, SEALING);
    type(GROUPS[1]);

    fireEvent.click(light());
    fireEvent.submit(field().closest("form")!);
    fireEvent.submit(field().closest("form")!);

    expect(confirmMock).toHaveBeenCalledOnce();
    await holdElapses();
  });

  it.each([
    ["too many tries", "too_many", S.tooMany],
    ["no connection", "offline", es.common.errors.couldntConnect],
    ["a failed confirmation", "failed", S.failed],
  ] as const)("after %s, the light goes off again, it says why, and the person can try again", async (_label, reason, message) => {
    confirmMock.mockResolvedValue({ type: "error", reason });
    renderStep(<SealTraceStep />, SEALING);
    type(GROUPS[1]);
    fireEvent.click(light());

    await holdElapses();

    expect(screen.getByRole("status").textContent).toBe(message);
    expect(lights()).toEqual(["on", "off", "on"]);
    expect(state("phase")).toBe("sealing");
    expect(state("key")).toBe(SEAL);
    expect(state("locked")).toBe("false");
    expect(light().disabled).toBe(false);
  });

  it("“Volver a ver mi sello” goes back to the card, holding the seal, and remembers which group was asked", () => {
    renderStep(<SealTraceStep />, SEALING);

    fireEvent.click(screen.getByRole("button", { name: S.back }));

    expect(state("phase")).toBe("keeping");
    expect(state("key")).toBe(SEAL);
    expect(state("lastAsked")).toBe("1");
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("“Mejor sin cartas” is here too: it closes without sealing and lets go of the seal", () => {
    renderStep(<SealTraceStep />, { ...SEALING, lastAsked: 0 });

    fireEvent.click(screen.getByRole("button", { name: es.leaveATrace.keep.withoutLetters }));

    expect(state("phase")).toBe("submitted");
    expect(state("key")).toBe("");
    expect(state("lastAsked")).toBe("");
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("with no seal in memory (the ritual was reset) shows nothing and goes to the closing", async () => {
    renderStep(<SealTraceStep />, { phase: "sealing", key: null });

    await act(async () => {});
    expect(state("phase")).toBe("submitted");
    expect(document.querySelector("[data-light]")).toBeNull();
  });
});

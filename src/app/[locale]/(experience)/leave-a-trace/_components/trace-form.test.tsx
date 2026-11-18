// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import { TraceForm } from "./trace-form";
import { renderStep } from "./trace-test-harness";

const T = es.leaveATrace;
const TEXT = "Lo que no dije también pesa.";

function setUp(lettersOpen: boolean, fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))) {
  vi.stubGlobal("fetch", fetchMock);
  const onResolved = vi.fn();
  renderStep(<TraceForm lettersOpen={lettersOpen} onResolved={onResolved} />);
  fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: TEXT } });
  return { fetchMock, onResolved };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TraceForm with letters closed", () => {
  it("sends the phrase as always, without mentioning letters, and reports it sent", async () => {
    const { fetchMock, onResolved } = setUp(false);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("submitted"));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ text: TEXT, origin: "leave_a_trace", locale: "es" });
    expect(sent).not.toHaveProperty("acceptsLetters");
    expect(screen.getByTestId("draft").textContent).toBe("");
  });

  it("shows the server's reason and keeps the text when it can't send", async () => {
    const { onResolved } = setUp(false, vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "too many requests" }), { status: 429 })));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await screen.findByText("too many requests");
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByTestId("draft").textContent).toBe(TEXT);
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("says it couldn't connect when the request fails", async () => {
    setUp(false, vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    await screen.findByText(es.common.errors.couldntConnect);
  });
});

describe("TraceForm with letters open", () => {
  it("sends nothing yet: it goes on to the choice, and the text stays in memory", () => {
    const { fetchMock, onResolved } = setUp(true);

    fireEvent.click(screen.getByRole("button", { name: T.submit }));

    expect(onResolved).toHaveBeenCalledWith("choosing");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("draft").textContent).toBe(TEXT);
  });
});

describe("TraceForm, either way", () => {
  it.each([true, false])("“Prefiero no dejar nada” leaves nothing, with letters open: %s", (lettersOpen) => {
    const { fetchMock, onResolved } = setUp(lettersOpen);

    fireEvent.click(screen.getByRole("button", { name: T.skip }));

    expect(onResolved).toHaveBeenCalledWith("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("draft").textContent).toBe("");
  });

  it("doesn't let an empty trace go on", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderStep(<TraceForm lettersOpen={true} onResolved={vi.fn()} />);

    expect((screen.getByRole("button", { name: T.submit }) as HTMLButtonElement).disabled).toBe(true);
  });
});

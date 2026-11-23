// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import { LettersChoiceStep } from "./letters-choice-step";
import { SEAL, SENTENCE, renderStep } from "./trace-test-harness";

const CHOICE = es.leaveATrace.choice;
const DRAFT = "Lo que no dije también pesa.";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body);
const phase = () => screen.getByTestId("phase").textContent;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LettersChoiceStep", () => {
  it("shows the trace the person wrote, the honest question and both ways to answer, and sends nothing yet", () => {
    const fetchMock = respond(200, { ok: true });

    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    expect(screen.getByText(`“${DRAFT}”`)).toBeTruthy();
    expect(screen.getByText(CHOICE.label)).toBeTruthy();
    expect(screen.getByText(CHOICE.headline)).toBeTruthy();
    expect(screen.getByText(CHOICE.body)).toBeTruthy();
    expect(screen.getByRole("button", { name: CHOICE.yes })).toBeTruthy();
    expect(screen.getByRole("button", { name: CHOICE.no })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells the person that nobody may write, that each letter is moderated without knowing who wrote it, and that they're kept 60 days", () => {
    expect(CHOICE.body).toContain("Puede que nadie escriba");
    expect(CHOICE.body).toContain("pasa por moderación");
    expect(CHOICE.body).toContain("sin saber quién la escribe");
    expect(CHOICE.body).toContain("60 días");
  });

  it("“Sí, quiero un sello” sends the phrase asking for letters, keeps the seal in memory and goes to keep it", async () => {
    const fetchMock = respond(200, { ok: true, returnKey: SEAL, returnKeySentence: SENTENCE });
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.yes }));

    await waitFor(() => expect(phase()).toBe("keeping"));
    expect(sent(fetchMock)).toMatchObject({ text: DRAFT, origin: "leave_a_trace", locale: "es", acceptsLetters: true });
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
    expect(screen.getByTestId("draft").textContent).toBe("");
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("“Así está bien” sends it as always, without asking for letters, and goes to the closing", async () => {
    const fetchMock = respond(200, { ok: true });
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.no }));

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(sent(fetchMock)).not.toHaveProperty("acceptsLetters");
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(screen.getByTestId("draft").textContent).toBe("");
  });

  it("goes to the closing, with no seal, when letters closed meanwhile and the server issued none", async () => {
    respond(200, { ok: true });
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.yes }));

    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it("keeps the person here, with their text, and says why when the server refuses", async () => {
    respond(429, { error: "too many requests" });
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.yes }));

    await screen.findByText("too many requests");
    expect(phase()).toBe("choosing");
    expect(screen.getByTestId("draft").textContent).toBe(DRAFT);
    expect((screen.getByRole("button", { name: CHOICE.yes }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("says it couldn't connect when the request fails, and lets the person try again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.no }));

    await screen.findByText(es.common.errors.couldntConnect);
    expect(phase()).toBe("choosing");
  });

  it("sends once however many times it's pressed, and holds the language switch while it sends", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    fireEvent.click(screen.getByRole("button", { name: CHOICE.yes }));
    await waitFor(() => expect(screen.getByTestId("locked").textContent).toBe("true"));
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.every((button) => button.disabled)).toBe(true);
    for (const button of buttons) fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await waitFor(() => expect(phase()).toBe("submitted"));
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("keeps the bot traps: a hidden field and the time the form was shown go with the phrase", async () => {
    const fetchMock = respond(200, { ok: true });
    const { container } = renderStep(<LettersChoiceStep />, { draft: DRAFT, phase: "choosing" });

    expect(container.querySelector('input[name="website"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: CHOICE.no }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toMatchObject({ honeypot: "" });
    expect(typeof sent(fetchMock).formRenderedAt).toBe("number");
  });
});

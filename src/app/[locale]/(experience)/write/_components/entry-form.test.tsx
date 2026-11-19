// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceProviders } from "@/app/_components/experience-state/providers";
import es from "../../../../../../messages/es.json";

const { writeHandoffMock, pushMock } = vi.hoisted(() => ({ writeHandoffMock: vi.fn(), pushMock: vi.fn() }));

vi.mock("../../_shared/mirror-handoff", () => ({ writeMirrorHandoff: writeHandoffMock }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("./searching", () => ({ Searching: () => <div data-testid="searching" /> }));

import { EntryForm } from "./entry-form";

// ADR-004 #212: what Write hands Mirror about a match decides whether Mirror offers a letter.

function renderForm() {
  return render(
    <NextIntlClientProvider locale="es" messages={es}>
      <ExperienceProviders>
        <EntryForm outcome={null} onOutcomeChange={() => {}} />
      </ExperienceProviders>
    </NextIntlClientProvider>
  );
}

function answerMatch(phrase: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ type: "matched", entryId: "entry-1", phrase: { id: "phrase-1", text: "Una frase.", ...phrase } }))
  );
}

async function submit() {
  fireEvent.change(screen.getByPlaceholderText(es.write.placeholder), { target: { value: "Hoy fue un día largo." } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: es.write.send }));
  });
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EntryForm, on a match", () => {
  it.each([
    ["can receive letters", { connectable: true }, true],
    ["can't receive letters", { connectable: false }, false],
    ["says nothing about letters", {}, false],
    ["says something that isn't a yes", { connectable: "yes" }, false],
  ])("hands Mirror a phrase that %s as connectable: %s", async (_label, phrase, connectable) => {
    answerMatch(phrase);
    renderForm();

    await submit();

    expect(writeHandoffMock).toHaveBeenCalledWith({
      outcome: "matched",
      text: "Una frase.",
      entryId: "entry-1",
      phraseId: "phrase-1",
      connectable,
    });
    expect(pushMock).toHaveBeenCalledWith("/mirror");
  });
});

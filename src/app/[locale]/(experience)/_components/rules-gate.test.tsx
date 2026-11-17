// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../messages/es.json";
import { RulesGate } from "./rules-gate";

const RULES = messages.rulesGate;

// A letters_open read that hasn't answered yet, resolved by the test when it wants.
function pendingLettersOpen() {
  let resolve!: (open: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { promise, resolve };
}

// Awaited act: RulesGate suspends on the flag, and React only retries a suspended render
// that started inside an awaited act once the promise resolves.
async function renderRulesGate(lettersOpen: Promise<boolean>) {
  const onAcknowledge = vi.fn();
  await act(async () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <RulesGate lettersOpen={lettersOpen} onAcknowledge={onAcknowledge} />
      </NextIntlClientProvider>
    );
  });
  return { onAcknowledge };
}

function acknowledgeButton() {
  return screen.getByRole<HTMLButtonElement>("button", { name: RULES.close });
}

afterEach(() => {
  cleanup();
});

describe("RulesGate", () => {
  it.each([
    ["closed", false, RULES.p2, RULES.p2LettersOpen],
    ["open", true, RULES.p2LettersOpen, RULES.p2],
  ])(
    "with letters %s, can't be acknowledged until its letters rule is on screen",
    async (_label, open, shownRule, hiddenRule) => {
      const lettersOpen = pendingLettersOpen();
      const { onAcknowledge } = await renderRulesGate(lettersOpen.promise);

      // While the flag loads, the rest of the dialog is already there, without either
      // letters rule, and accepting does nothing.
      await screen.findByText(RULES.p1);
      expect(screen.queryByText(RULES.p2)).toBeNull();
      expect(screen.queryByText(RULES.p2LettersOpen)).toBeNull();
      expect(acknowledgeButton().disabled).toBe(true);
      fireEvent.click(acknowledgeButton());
      expect(onAcknowledge).not.toHaveBeenCalled();

      await act(async () => lettersOpen.resolve(open));

      expect(screen.getByText(shownRule)).toBeTruthy();
      expect(screen.queryByText(hiddenRule)).toBeNull();
      expect(acknowledgeButton().disabled).toBe(false);
      fireEvent.click(acknowledgeButton());
      expect(onAcknowledge).toHaveBeenCalledOnce();
    }
  );

  it("can't be dismissed with Escape, only acknowledged with its button", async () => {
    const { onAcknowledge } = await renderRulesGate(Promise.resolve(false));
    await screen.findByText(RULES.p2);

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onAcknowledge).not.toHaveBeenCalled();
  });
});

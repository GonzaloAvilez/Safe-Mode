// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LETTER_MAX_LENGTH } from "@/lib/letters";
import en from "../../../../../messages/en.json";
import es from "../../../../../messages/es.json";
import { LETTER_MAX_CHARACTERS, LetterDraftPaper } from "./letter-draft-paper";

// lib/letters.ts is server code: only its constant is read here, so what it connects to is stubbed.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/letter-safety", () => ({ checkLetterSafety: vi.fn() }));

const P = es.letterPaper;
const onChange = vi.fn();

function renderPaper({ value = "", letterNumber = 1, locale = "es" as "es" | "en" } = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <LetterDraftPaper letterNumber={letterNumber} value={value} onChange={onChange} noticeId="the-notice" />
      <p id="the-notice">Esta carta no puede salir así.</p>
    </NextIntlClientProvider>
  );
}

const field = () => screen.getByLabelText(P.fieldLabel) as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LetterDraftPaper", () => {
  it("allows exactly as long a letter as the server does", () => {
    expect(LETTER_MAX_CHARACTERS).toBe(LETTER_MAX_LENGTH);
  });

  it("says which letter of the correspondence this one will be", () => {
    renderPaper({ letterNumber: 3 });

    expect(screen.getByText("Carta 3 · La tuya")).toBeTruthy();
  });

  it("holds the text it's given, counts it, and never lets it grow past the limit", () => {
    renderPaper({ value: "Gracias por tu frase." });

    expect(field().value).toBe("Gracias por tu frase.");
    expect(field().maxLength).toBe(LETTER_MAX_CHARACTERS);
    expect(screen.getByText(`21 / ${LETTER_MAX_CHARACTERS}`)).toBeTruthy();
  });

  it("hands every change to the screen, which keeps the draft", () => {
    renderPaper();

    fireEvent.change(field(), { target: { value: "Hola" } });

    expect(onChange).toHaveBeenCalledWith("Hola");
  });

  it("reads the screen's notice together with the field", () => {
    renderPaper();

    expect(field().getAttribute("aria-describedby")).toBe("the-notice");
  });

  it("asks for no contact details, with a placeholder, in the visitor's language", () => {
    renderPaper({ locale: "en" });

    expect(screen.getByText(en.letterPaper.noContact)).toBeTruthy();
    expect(screen.getByPlaceholderText(en.letterPaper.placeholder)).toBeTruthy();
    expect(screen.getByText("Letter 1 · Yours")).toBeTruthy();
  });
});

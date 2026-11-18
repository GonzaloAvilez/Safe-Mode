// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import type { LetterSender } from "@/lib/letter-lifecycle";
import type { MailboxLetter } from "@/lib/mailbox";
import { LetterPaper } from "./letter-paper";
import { letter } from "./mailbox-test-harness";

const T = es.mailbox.letter;
const NOW = new Date("2026-11-18T12:00:00Z");
const THREE_DAYS_AGO = "2026-11-15T12:00:00Z";

function renderPaper(each: MailboxLetter, yourSide: LetterSender = "author", locale: "es" | "en" = "es", number = 1) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <LetterPaper letter={{ ...each, createdAt: THREE_DAYS_AGO }} number={number} yourSide={yourSide} now={NOW} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe("LetterPaper", () => {
  it("shows a delivered letter's text, its number and how long ago it was written", () => {
    renderPaper(letter({ body: "Gracias por dejarla ahí." }), "author", "es", 2);

    expect(screen.getByText("Gracias por dejarla ahí.")).toBeTruthy();
    expect(screen.getByText("Carta 2")).toBeTruthy();
    expect(screen.getByText("hace 3 días")).toBeTruthy();
  });

  it("signs a visitor's letter, for the author, as someone who saw themselves in the phrase", () => {
    renderPaper(letter({ sender: "visitor" }), "author");

    expect(screen.getByText(T.fromVisitor)).toBeTruthy();
  });

  it("signs the author's letter, for the visitor, as whoever left the phrase", () => {
    renderPaper(letter({ sender: "author" }), "visitor");

    expect(screen.getByText(T.fromAuthor)).toBeTruthy();
  });

  it("marks your own letter as yours, unsigned", () => {
    renderPaper(letter({ sender: "author" }), "author");

    expect(screen.getByText(`Carta 1 · ${T.yours}`)).toBeTruthy();
    expect(screen.queryByText(T.fromVisitor)).toBeNull();
    expect(screen.queryByText(T.fromAuthor)).toBeNull();
  });

  it("postmarks your letter in review as on its way, up to 48 hours", () => {
    renderPaper(letter({ sender: "visitor", status: "held", deliveredAt: null }), "visitor");

    expect(screen.getByText(T.held)).toBeTruthy();
    expect(screen.getByText(T.heldNote)).toBeTruthy();
    expect(screen.queryByText(T.rejected)).toBeNull();
  });

  it("postmarks your letter rejected in review as not delivered, and says it doesn't use your turn", () => {
    renderPaper(letter({ sender: "visitor", status: "rejected", deliveredAt: null }), "visitor");

    expect(screen.getByText(T.rejected)).toBeTruthy();
    expect(screen.getByText(T.rejectedHeadline)).toBeTruthy();
    expect(screen.getByText(T.rejectedBody)).toBeTruthy();
    expect(screen.queryByText(T.heldNote)).toBeNull();
  });

  it("a delivered letter carries no postmark and no note", () => {
    renderPaper(letter(), "author");

    expect(screen.queryByText(T.held)).toBeNull();
    expect(screen.queryByText(T.rejected)).toBeNull();
    expect(screen.queryByText(T.heldNote)).toBeNull();
    expect(screen.queryByText(T.erasedHeadline)).toBeNull();
  });

  it("a letter whose text was erased after 60 days says someone wrote to you", () => {
    renderPaper(letter({ sender: "visitor", body: null }), "author");

    expect(screen.getByText(T.erasedHeadline)).toBeTruthy();
    expect(screen.getByText(T.erasedTheirs)).toBeTruthy();
    expect(screen.getByText(T.fromVisitor)).toBeTruthy();
  });

  it("your own letter, erased, says you wrote to them", () => {
    renderPaper(letter({ sender: "author", body: null }), "author");

    expect(screen.getByText(T.erasedYours)).toBeTruthy();
    expect(screen.queryByText(T.erasedTheirs)).toBeNull();
  });

  it("an erased letter you sent that was in review shows the erasure, not a postmark", () => {
    renderPaper(letter({ sender: "visitor", status: "held", body: null }), "visitor");

    expect(screen.getByText(T.erasedHeadline)).toBeTruthy();
    expect(screen.queryByText(T.held)).toBeNull();
  });

  it("speaks English too", () => {
    renderPaper(letter({ sender: "visitor" }), "author", "en");

    expect(screen.getByText(en.mailbox.letter.fromVisitor)).toBeTruthy();
    expect(screen.getByText("3 days ago")).toBeTruthy();
  });
});

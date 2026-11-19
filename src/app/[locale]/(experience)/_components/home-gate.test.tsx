// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import es from "../../../../../messages/es.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "es" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../_shared/screen-cta", () => ({ ScreenCta: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("./rules-gate", () => ({ RulesGate: () => <div data-testid="rules-gate" /> }));
vi.mock("./arrival-intro", () => ({ ArrivalIntro: () => <div data-testid="arrival-intro" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { HomeGate } from "./home-gate";

// The visitor's stage, as Home reads it from the browser.
function visitor(stage: "first time" | "rules read" | "back again") {
  if (stage !== "first time") localStorage.setItem("sm:rulesAcknowledged", "true");
  if (stage === "back again") localStorage.setItem("sm:arrivalIntroSeen:v3", "true");
}

// Awaited act: the door suspends on the flag until it resolves.
async function renderHome(lettersOpen: boolean, locale: "es" | "en" = "es") {
  await act(async () => {
    render(
      <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
        <HomeGate introPhrase={null} lettersOpen={Promise.resolve(lettersOpen)} />
      </NextIntlClientProvider>
    );
  });
}

const door = () => screen.queryByRole("link", { name: es.home.mailboxDoor });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("HomeGate, the door to the mailbox (ADR-004 #213, design B1)", () => {
  it("is on Home for someone coming back, while letters are open, and leads to the mailbox", async () => {
    visitor("back again");
    await renderHome(true);

    expect(door()).toBeTruthy();
    expect(door()!.getAttribute("href")).toBe("/mailbox");
  });

  it("isn't there while letters are closed", async () => {
    visitor("back again");
    await renderHome(false);

    expect(door()).toBeNull();
  });

  it("never shows over the rules", async () => {
    visitor("first time");
    await renderHome(true);

    expect(screen.getByTestId("rules-gate")).toBeTruthy();
    expect(door()).toBeNull();
  });

  it("never shows over the welcome", async () => {
    visitor("rules read");
    await renderHome(true);

    expect(screen.getByTestId("arrival-intro")).toBeTruthy();
    expect(door()).toBeNull();
  });

  it("is named in English too", async () => {
    visitor("back again");
    await renderHome(true, "en");

    expect(screen.getByRole("link", { name: en.home.mailboxDoor })).toBeTruthy();
  });
});

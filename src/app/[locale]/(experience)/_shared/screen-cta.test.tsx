// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenCta } from "./screen-cta";

vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "es" }) }));
vi.mock("./handpan-audio", () => ({ playTransition: vi.fn() }));

afterEach(cleanup);

const classesOf = (element: HTMLElement) => element.className.split(/\s+/);

describe("ScreenCta placement", () => {
  it.each([false, true])("floats over the bottom of the screen by default (disabled: %s)", (disabled) => {
    render(<ScreenCta href="/gratitude" label="Seguir" accentRgb="1,2,3" disabled={disabled} />);
    const cta = screen.getByText("Seguir").parentElement!;

    expect(classesOf(cta)).toEqual(expect.arrayContaining(["fixed", "bottom-8"]));
  });

  // #263: Mirror's content can be taller than the screen; after it, "Seguir" can't cover it.
  it.each([false, true])("sits after the content, never floating, with placement flow (disabled: %s)", (disabled) => {
    render(<ScreenCta href="/gratitude" label="Seguir" accentRgb="1,2,3" disabled={disabled} placement="flow" />);
    const cta = screen.getByText("Seguir").parentElement!;

    expect(classesOf(cta)).not.toContain("fixed");
    expect(classesOf(cta)).toEqual(expect.arrayContaining(["relative", "self-center"]));
  });

  it("still leads where it says, in the visitor's language", () => {
    render(<ScreenCta href="/gratitude" label="Seguir" accentRgb="1,2,3" placement="flow" />);

    expect(screen.getByRole("link", { name: "Seguir" }).getAttribute("href")).toBe("/es/gratitude");
  });
});

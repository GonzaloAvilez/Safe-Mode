// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, isIosDevice } from "./download-blob";

describe("downloadBlob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn().mockReturnValue("blob:refugio-card");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads the picture under the given name, and leaves nothing behind in the page", () => {
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    const blob = new Blob(["png"], { type: "image/png" });

    downloadBlob(blob, "refugio-sello.png");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ href: "blob:refugio-card", download: "refugio-sello.png" }]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("lets go of the picture's address a little later, not before the browser has read it", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadBlob(new Blob(["png"]), "x.png");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:refugio-card");
  });
});

describe("isIosDevice", () => {
  // jsdom has no maxTouchPoints to spy on, so the whole navigator is replaced.
  function device(userAgent: string, platform = "", maxTouchPoints = 0) {
    vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["an iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5, true],
    ["an iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5, true],
    ["an iPad that says it's a Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5, true],
    ["a Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0, false],
    ["an Android phone", "Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Linux armv8l", 5, false],
    ["a Windows computer", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0, false],
  ])("%s", (_label, userAgent, platform, touchPoints, expected) => {
    device(userAgent, platform, touchPoints);

    expect(isIosDevice()).toBe(expected);
  });
});

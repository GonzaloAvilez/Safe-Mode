import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  const result = manifest();

  it("opens as its own app from the site root, which the proxy sends to the person's locale", () => {
    expect(result).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", name: "Refugio" });
  });

  it("lists the 192 and 512 icons installing requires, and both exist", () => {
    expect(result.icons?.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    for (const icon of result.icons ?? []) {
      expect(existsSync(path.resolve(__dirname, "../../public", `.${icon.src}`))).toBe(true);
    }
  });
});

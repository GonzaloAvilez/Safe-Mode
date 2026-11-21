import { describe, expect, it } from "vitest";
import {
  LETTER_AUTO_REJECT_CATEGORIES,
  hasAutoRejectLetterCategory,
  type ModerationCategory,
} from "@/lib/safety/letter-auto-reject";

describe("hasAutoRejectLetterCategory", () => {
  describe("detects", () => {
    it.each(LETTER_AUTO_REJECT_CATEGORIES)("%s on its own", (category) => {
      expect(hasAutoRejectLetterCategory([category])).toBe(true);
    });

    // The one real threat in the #265 probe: "sé dónde vive y voy a ir a su casa el
    // viernes, le voy a romper la cara". It carries `violence` too, but the category on
    // the list is `harassment/threatening`.
    it("a threat, which arrives mixed in with violence", () => {
      expect(hasAutoRejectLetterCategory(["harassment", "harassment/threatening", "violence"])).toBe(true);
    });
  });

  describe("allows", () => {
    it("nothing flagged at all", () => {
      expect(hasAutoRejectLetterCategory([])).toBe(false);
    });

    // Every false positive measured in #265 looked exactly like these: 34 letters about
    // loss in ES and EN, and the ones refused carried `violence` and nothing else.
    it.each([
      ["a pet that died under the writer's own car", ["violence"]],
      ["a cousin murdered leaving work", ["violence"]],
      ["a father's fall, told with the injury in it", ["violence", "violence/graphic"]],
      ["a driver who killed someone by accident", ["violence"]],
    ] as [string, ModerationCategory[]][])("%s", (_case, categories) => {
      expect(hasAutoRejectLetterCategory(categories)).toBe(false);
    });

    // Deliberate, and the open judgement call in #265: these reach the human review queue
    // rather than being refused by a machine. If that changes, this test should fail loudly.
    it.each([["harassment"], ["hate"], ["sexual"], ["illicit"]] as ModerationCategory[][])(
      "%s without its threatening variant",
      (category) => {
        expect(hasAutoRejectLetterCategory([category])).toBe(false);
      }
    );

    it("self-harm, which the crisis gate owns and decides first", () => {
      expect(hasAutoRejectLetterCategory(["self-harm", "self-harm/intent"])).toBe(false);
    });
  });
});

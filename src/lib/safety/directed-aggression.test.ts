import { describe, expect, it } from "vitest";
import {
  DIRECTED_AGGRESSION_CATEGORIES,
  hasDirectedAggression,
  type ModerationCategory,
} from "@/lib/safety/directed-aggression";

describe("hasDirectedAggression", () => {
  describe("detects", () => {
    it.each(DIRECTED_AGGRESSION_CATEGORIES)("%s on its own", (category) => {
      expect(hasDirectedAggression([category])).toBe(true);
    });

    // The one real threat in the #265 probe: "sé dónde vive y voy a ir a su casa el
    // viernes, le voy a romper la cara". It carries `violence` too, but what names it as
    // aggression is `harassment/threatening`.
    it("a threat, which arrives mixed in with violence", () => {
      expect(hasDirectedAggression(["harassment", "harassment/threatening", "violence"])).toBe(true);
    });
  });

  describe("allows", () => {
    it("nothing flagged at all", () => {
      expect(hasDirectedAggression([])).toBe(false);
    });

    // Every false positive measured in #265 looked exactly like these: 34 letters about
    // loss in ES and EN, and the ones refused carried `violence` and nothing else.
    it.each([
      ["a pet that died under the writer's own car", ["violence"]],
      ["a cousin murdered leaving work", ["violence"]],
      ["a father's fall, told with the injury in it", ["violence", "violence/graphic"]],
      ["a driver who killed someone by accident", ["violence"]],
    ] as [string, ModerationCategory[]][])("%s", (_case, categories) => {
      expect(hasDirectedAggression(categories)).toBe(false);
    });

    // Deliberate, and the open judgement call in #265: these reach the human review queue
    // rather than being refused by a machine. If that changes, this test should fail loudly.
    it.each([["harassment"], ["hate"], ["sexual"], ["illicit"]] as ModerationCategory[][])(
      "%s without its threatening variant",
      (category) => {
        expect(hasDirectedAggression([category])).toBe(false);
      }
    );

    it("self-harm, which the crisis gate owns and decides first", () => {
      expect(hasDirectedAggression(["self-harm", "self-harm/intent"])).toBe(false);
    });
  });
});

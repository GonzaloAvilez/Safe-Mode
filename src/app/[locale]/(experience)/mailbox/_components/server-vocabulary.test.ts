import { describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import { POSTMARKS } from "./correspondence-list";
import { LETTER_POSTMARKS } from "./letter-paper";
import { LETTER_CONTACT_KINDS } from "../../_shared/letters/send-letter";

// The build already makes the screen handle every state, status and contact kind the server has
// (`satisfies` against the server's types). This checks the other half: each of them has words to
// show, in both languages.
const catalogs = { es, en };

describe("every server state has its words", () => {
  it.each(Object.entries(catalogs))("in %s, every correspondence state has a postmark", (_locale, messages) => {
    for (const key of Object.values(POSTMARKS)) {
      const [, state] = key.split(".");
      expect(messages.mailbox.list.postmark[state as keyof typeof messages.mailbox.list.postmark]).toBeTruthy();
    }
  });

  it.each(Object.entries(catalogs))("in %s, every letter status that gets a postmark has one", (_locale, messages) => {
    for (const postmark of Object.values(LETTER_POSTMARKS)) {
      if (postmark) expect(messages.mailbox.letter[postmark]).toBeTruthy();
    }
  });

  it.each(Object.entries(catalogs))("in %s, every kind of contact the server finds can be named", (_locale, messages) => {
    for (const kind of LETTER_CONTACT_KINDS) {
      expect(messages.letterNotice.contactKind[kind]).toBeTruthy();
    }
  });
});

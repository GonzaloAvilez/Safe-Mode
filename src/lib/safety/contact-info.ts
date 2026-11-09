// ADR-004 layer 6 (#210, part A): letters between strangers must never carry a way to
// reach someone outside Refugio. This detects explicit contact identifiers in a letter so
// the safety pipeline can stop it before delivery.
//
// Pure function, bilingual (ES/EN), no network calls. It catches identifiers, not intent:
//   - email, including "arroba/at ... punto/dot" obfuscation
//   - URLs and bare domains
//   - phone numbers (7+ digits)
//   - @handles
//   - a platform name followed by a username-looking token ("IG: juanito_99")
//
// The opposite mistake matters just as much: a false positive rejects an honest letter.
// Every pattern below is tuned against ordinary emotional writing in both languages,
// including phone typing habits like a missing space after a period ("Lloré.Ni siquiera").
//
// Deliberately NOT detected: platform names on their own ("borré instagram", "I quit
// WhatsApp"), or followed by a plain word ("mi insta es juanito"). In emotional writing
// platform names are usually part of the story, not an invitation, so blocking them would
// reject honest letters. Spelled-out digits ("cinco cinco...") are also out of scope.
// Both gaps are what moderation and human review exist for.

export type ContactInfoKind = "email" | "url" | "phone" | "handle";

export type ContactInfoResult = {
  found: boolean;
  kinds: ContactInfoKind[];
};

// Zero-width characters someone could insert to split an identifier past a regex.
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

// ---------------------------------------------------------------------------------------
// TLD lists, strictest first. A pattern with little other evidence gets a strict list.
// ---------------------------------------------------------------------------------------

// For a dotted word that is the ONLY evidence (no "@", no "arroba", no path). Leaves out
// every TLD that is also a common word ("ni", "ve", "pa", "es", "me", "so", "live",
// "info", "app"...), because phone typing often drops the space after a period.
const BARE_TLDS = [
  "com", "net", "org", "io", "xyz", "biz", "dev", "gg", "ly", "ee",
  "mx", "ar", "cl", "pe", "uy", "bo", "py", "ec", "gt", "cr", "hn", "sv",
];

// For an email-shaped run that already has "arroba"/"at": adds common email TLDs that
// aren't words likely to follow "at home." in a typo ("it", "me", "so", "de" stay out).
const EMAIL_TLDS = [...BARE_TLDS, "es", "co", "edu", "gov", "uk", "ca", "br", "fr"];

// For a domain followed by a path ("t.me/juan"): link shorteners and link-in-bio
// services use short or word-like TLDs, and the "/" is strong evidence on its own.
const PATH_TLDS = [
  ...EMAIL_TLDS,
  "me", "to", "so", "la", "ai", "cc", "ws", "eu", "tv", "app", "info", "page", "link",
  "site", "online", "live", "shop", "store", "blog",
];

const anyOf = (words: readonly string[]) => `(?:${words.join("|")})`;

// Building blocks shared by the email and URL patterns.
const LOCAL_PART = "[\\p{L}\\p{N}._%+-]+";
const LABEL = "[\\p{L}\\p{N}-]+";
const WORD_END = "(?![\\p{L}\\p{N}])";
const NOT_AFTER_WORD = "(?<![\\p{L}\\p{N}@])";

// ---------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------

// "juan.perez@gmail.com": no spaces at all, so any TLD counts.
const STRICT_EMAIL = new RegExp(`${LOCAL_PART}@${LABEL}(?:\\.${LABEL})*\\.\\p{L}{2,}${WORD_END}`, "u");

// "juan @ gmail . com": spaces are a common way past a strict pattern, but "@" is also
// written as "at" ("I'm @ home. Alone again"), so a spaced email needs a strict TLD.
const SPACED_EMAIL = new RegExp(
  `${LOCAL_PART}\\s*@\\s*${LABEL}(?:\\s*\\.\\s*${LABEL})*?\\s*\\.\\s*${anyOf(BARE_TLDS)}${WORD_END}`,
  "iu"
);

// "juan arroba gmail punto com", "juan (at) gmail [dot] com", "juan(arroba)gmail.com".
// "at" is one of the most common English words ("I was at home. Then I cried"), so the
// word must stand alone and the ending must be a real TLD, never just any next word.
// A spelled-out "punto"/"dot" is strong evidence on its own (nobody writes it by accident
// before a TLD), so it accepts the loosest list: "jane at proton dot me".
const AT_WORD = "[([{]?\\s*(?<![\\p{L}\\p{N}])(?:arroba|at)(?![\\p{L}\\p{N}])\\s*[)\\]}]?";
const SPELLED_DOT = `\\s*[([{]?\\s*(?:punto|dot)\\s*[)\\]}]?\\s*${anyOf(PATH_TLDS)}`;
const GLUED_DOT = `[([{]?\\.[)\\]}]?${anyOf(EMAIL_TLDS)}`;
const SPACED_DOT = `\\s*\\.\\s*${anyOf(BARE_TLDS)}`;
const OBFUSCATED_EMAIL = new RegExp(
  `${LOCAL_PART}\\s*${AT_WORD}\\s*${LABEL}(?:${SPELLED_DOT}|${GLUED_DOT}|${SPACED_DOT})${WORD_END}`,
  "iu"
);

// ---------------------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------------------

const URL_WITH_SCHEME_OR_WWW = /(?:https?:\/\/|www\.)\S+/i;

// "mipagina.com", "tienda.mx". Word-like TLDs are left out (see BARE_TLDS); those still
// get caught with a scheme, www., or a path.
const BARE_DOMAIN = new RegExp(
  `${NOT_AFTER_WORD}${LABEL}(?:\\.${LABEL})*\\.${anyOf(BARE_TLDS)}${WORD_END}`,
  "iu"
);

// "t.me/juan", "wa.me/5255...", "linktr.ee/juan". The TLD must be a real one so a
// missing space before "mal/peor" isn't read as a link.
const DOMAIN_WITH_PATH = new RegExp(
  `${NOT_AFTER_WORD}${LABEL}(?:\\.${LABEL})*\\.${anyOf(PATH_TLDS)}\\/\\S+`,
  "iu"
);

// ---------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------

// A run of digits and common phone separators. Digit count is checked separately.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{5,}\d/g;
const MIN_PHONE_DIGITS = 7;

// Digit runs that look like phones but aren't:
// "12.05.2020", "3-4-2019"
const DATE_LIKE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
// "2019-2021", "1998 - 2003"
const YEAR_RANGE = /^(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}$/;
// "1.500.000", "1 000 000". Phones are also written in groups of three ("612 345 678"),
// so grouping alone isn't enough: it also has to end in "000" or sit next to a currency.
const THOUSANDS_GROUPED = /^\d{1,3}([.\s])\d{3}(?:\1\d{3})*$/;
const CURRENCY_BEFORE = /[$€£]\s*$/;
const CURRENCY_AFTER = /^\s*(?:de\s+)?(?:pesos|euros|d[oó]lares|dollars|bucks|soles|usd|mxn|eur)(?!\p{L})/iu;

function isAmount(candidate: string, textBefore: string, textAfter: string): boolean {
  if (!THOUSANDS_GROUPED.test(candidate)) return false;
  return candidate.endsWith("000") || CURRENCY_BEFORE.test(textBefore) || CURRENCY_AFTER.test(textAfter);
}

function containsPhone(text: string): boolean {
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const candidate = match[0];
    const start = match.index;
    const end = start + candidate.length;

    if (DATE_LIKE.test(candidate) || YEAR_RANGE.test(candidate)) continue;
    if (isAmount(candidate, text.slice(0, start), text.slice(end))) continue;

    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_DIGITS) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------------------

// "@juan_perez". Not preceded by a letter/digit, so inclusive-language "tod@s" and emails
// don't count. Must start with a letter or "_", so a time like "@5am" doesn't count.
// Known gap: "@casa" (as "at home") is indistinguishable from a handle and is flagged.
const HANDLE = /(?<![\p{L}\p{N}_.@])@[\p{L}_](?:[\p{L}\p{N}_.]{0,28}[\p{L}\p{N}_])?/u;

// A platform name followed by a username without "@": "IG: juanito_99", "mi insta es
// juan.perez". Ambiguous short names ("x", "line", "signal") are left out on purpose.
const PLATFORMS = [
  "instagram", "insta", "ig", "whatsapp", "whats", "wsp", "telegram", "tg", "snapchat", "snap",
  "discord", "tiktok", "facebook", "fb", "twitter", "threads", "kik",
];
const SEPARATOR = "(?::|=|->|→|\\bes\\b|\\bis\\b|\\bcomo\\b|\\bas\\b)";
// Dots only count inside the token, so trailing "..." never makes a word look like one.
const TOKEN = "([\\p{L}\\p{N}_]+(?:\\.[\\p{L}\\p{N}_]+)*)";
const PLATFORM = `(?<![\\p{L}\\p{N}])${anyOf(PLATFORMS)}(?![\\p{L}\\p{N}])`;
// "IG: juanito_99"
const PLATFORM_THEN_TOKEN = new RegExp(`${PLATFORM}\\s*${SEPARATOR}?\\s*@?${TOKEN}`, "giu");
// "juan_perez99 en insta", "jane.doe88 on my ig"
const TOKEN_THEN_PLATFORM = new RegExp(
  `(?<![\\p{L}\\p{N}_.])${TOKEN}\\s+(?:en|on|in|de)\\s+(?:mi\\s+|my\\s+)?${PLATFORM}`,
  "giu"
);
// Number words that have a letter and a digit but aren't usernames: ordinals ("2da",
// "3er", "1st") and decades ("my 20s", "los 90s").
const NUMBER_WORD = /^\d+(?:ro|ra|do|da|er|to|ta|vo|va|no|na|mo|ma|st|nd|rd|th|s)$/i;

// A username has at least one letter AND at least one digit, "_" or inner ".": that's
// what separates "juanito_99" from "porque" in "borré instagram porque...".
function looksLikeUsername(token: string): boolean {
  return token.length >= 3 && /\p{L}/u.test(token) && /[\p{N}_.]/u.test(token) && !NUMBER_WORD.test(token);
}

function containsPlatformUsername(text: string): boolean {
  for (const pattern of [PLATFORM_THEN_TOKEN, TOKEN_THEN_PLATFORM]) {
    for (const match of text.matchAll(pattern)) {
      if (looksLikeUsername(match[1])) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------

export function detectContactInfo(rawText: string): ContactInfoResult {
  // NFKC folds look-alike characters (fullwidth "ｊｕａｎ＠ｇｍａｉｌ．ｃｏｍ") into plain ASCII.
  const text = rawText.normalize("NFKC").replace(ZERO_WIDTH, "");

  const kinds: ContactInfoKind[] = [];
  const hasAtSignEmail = STRICT_EMAIL.test(text) || SPACED_EMAIL.test(text);
  const hasEmail = hasAtSignEmail || OBFUSCATED_EMAIL.test(text);

  if (hasEmail) kinds.push("email");
  // An "@" email's own domain ("gmail.com") would also match BARE_DOMAIN; don't
  // double-report it. Without "@" it's genuinely ambiguous: "john at gmail.com" is an
  // email, "find me at lonelywolf.xyz" is a link, and both read the same, so report both.
  if (URL_WITH_SCHEME_OR_WWW.test(text) || DOMAIN_WITH_PATH.test(text) || (!hasAtSignEmail && BARE_DOMAIN.test(text))) {
    kinds.push("url");
  }
  if (containsPhone(text)) kinds.push("phone");
  if (HANDLE.test(text) || containsPlatformUsername(text)) kinds.push("handle");

  return { found: kinds.length > 0, kinds };
}

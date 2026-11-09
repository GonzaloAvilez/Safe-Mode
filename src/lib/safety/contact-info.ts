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
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

// Tolerates spaces around "@" and ".", a common way to slip past a strict pattern:
// "juan @ gmail . com".
const EMAIL = /[\p{L}\p{N}._%+-]+\s*@\s*[\p{L}\p{N}-]+(?:\s*\.\s*[\p{L}\p{N}-]+)*\s*\.\s*\p{L}{2,}/u;

// "juan arroba gmail punto com", "juan (at) gmail [dot] com", "juan(arroba)gmail.com"
const OBFUSCATED_EMAIL =
  /[\p{L}\p{N}._+-]+\s*[([{]?\s*(?:arroba|at)\s*[)\]}]?\s*[\p{L}\p{N}-]+\s*[([{]?\s*(?:punto|dot|\.)\s*[)\]}]?\s*\p{L}{2,}/iu;

const URL_WITH_SCHEME_OR_WWW = /(?:https?:\/\/|www\.)\S+/i;

// TLDs that are rarely ordinary words in Spanish or English, so "something.tld" without a
// scheme is almost certainly a domain. Short TLDs that ARE common words (es, me, co, so,
// to, de...) are left out on purpose: "triste.es" is far more likely a missing space than a
// link. Those still get caught with a scheme, www., or a path (see below).
const UNAMBIGUOUS_TLDS = [
  "com", "net", "org", "info", "io", "app", "dev", "xyz", "site", "online", "link", "page",
  "blog", "shop", "store", "live", "tv", "gg", "ly", "ee", "biz",
  "mx", "ar", "cl", "pe", "uy", "ve", "bo", "py", "ec", "gt", "cr", "pa", "hn", "sv", "ni",
];
const BARE_DOMAIN = new RegExp(`(?<![\\p{L}\\p{N}@])[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${UNAMBIGUOUS_TLDS.join("|")})(?![\\p{L}\\p{N}])`, "iu");

// Any 2+ letter TLD followed by a path: "t.me/juan", "wa.me/5255...", "linktr.ee/juan".
const DOMAIN_WITH_PATH = /(?<![\p{L}\p{N}@])[\p{L}\p{N}-]+\.\p{L}{2,}\/\S+/u;

// A run of digits and common phone separators. Digit count is checked separately.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{5,}\d/g;
const MIN_PHONE_DIGITS = 7;
// "12.05.2020", "3-4-2019": dates look like digit runs but aren't phone numbers.
const DATE_LIKE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

// "@juan_perez". Not preceded by a letter/digit, so inclusive-language "tod@s" and
// emails don't count.
const HANDLE = /(?<![\p{L}\p{N}_.@])@[\p{L}\p{N}_](?:[\p{L}\p{N}_.]{0,28}[\p{L}\p{N}_])?/u;

// A platform name followed by a username without "@": "IG: juanito_99", "mi insta es
// juan.perez". Only counts when the token looks like a username (has a digit, "_" or "."
// and at least one letter), so "borré instagram porque..." stays allowed. Ambiguous short
// names ("x", "line", "signal") are left out on purpose.
const PLATFORMS = [
  "instagram", "insta", "ig", "whatsapp", "whats", "wsp", "telegram", "tg", "snapchat", "snap",
  "discord", "tiktok", "facebook", "fb", "twitter", "threads", "kik",
];
const PLATFORM_USERNAME = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${PLATFORMS.join("|")})(?![\\p{L}\\p{N}])\\s*(?::|=|->|→|\\bes\\b|\\bis\\b|\\bcomo\\b|\\bas\\b)?\\s*@?(?=[\\p{L}\\p{N}_.]*\\p{L})(?=[\\p{L}\\p{N}_.]*[\\p{N}_.])[\\p{L}\\p{N}_][\\p{L}\\p{N}_.]{2,}`,
  "iu"
);

function containsPhone(text: string): boolean {
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const candidate = match[0].trim();
    if (DATE_LIKE.test(candidate)) continue;
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_DIGITS) return true;
  }
  return false;
}

export function detectContactInfo(rawText: string): ContactInfoResult {
  // NFKC folds look-alike characters (fullwidth "ｊｕａｎ＠ｇｍａｉｌ．ｃｏｍ") into plain ASCII.
  const text = rawText.normalize("NFKC").replace(ZERO_WIDTH, "");

  const kinds: ContactInfoKind[] = [];
  const hasEmail = EMAIL.test(text) || OBFUSCATED_EMAIL.test(text);

  if (hasEmail) kinds.push("email");
  if (URL_WITH_SCHEME_OR_WWW.test(text) || DOMAIN_WITH_PATH.test(text) || (!hasEmail && BARE_DOMAIN.test(text))) {
    kinds.push("url");
  }
  if (containsPhone(text)) kinds.push("phone");
  if (HANDLE.test(text) || PLATFORM_USERNAME.test(text)) kinds.push("handle");

  return { found: kinds.length > 0, kinds };
}

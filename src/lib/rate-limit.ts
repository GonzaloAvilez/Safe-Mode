import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logRequestOutcome } from "@/lib/logging";

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW = "60 s";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW),
  prefix: "ratelimit:entries",
});

type RateLimitIdentifiers = {
  ip: string;
  sessionId: string;
};

// Blocks before any Supabase/OpenAI call is made. Limits by IP and by anonymous session (P3)
// independently — either one hitting the window blocks the request, since a single IP can
// host multiple sessions and a session can hop IPs.
// Fails open: if Upstash itself is unreachable, we let the request through rather than taking
// down entry submission over an outage in a service that only exists to prevent abuse.
export async function isRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      ratelimit.limit(`ip:${ip}`),
      ratelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

// Separate instance/prefix from the entries limiter above, so resonate taps (a much
// higher-frequency, lower-stakes action) don't share — and can't exhaust — the same
// budget as entry submission. Own threshold, not entries' — Home cycles phrases every
// ~4.3s (HOLD_MS + GAP_MS in living-phrases.tsx), so a genuinely engaged visitor
// resonating with literally everything they see can hit ~14 distinct phrases/minute —
// that natural ceiling is the number itself, not a floor to pad above: it already
// covers "resonated with all of them," and anything faster than that isn't a human
// tapping a button. 10/60s (entries' number) cut that visitor off mid-browse; found
// live 2026-08-02.
const RESONATE_RATE_LIMIT_MAX_REQUESTS = 14;

const resonateRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RESONATE_RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW),
  prefix: "ratelimit:resonate",
});

export async function isResonateRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      resonateRatelimit.limit(`ip:${ip}`),
      resonateRatelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

// Letters (starting a correspondence and every later letter share this budget). Much
// lower than entries: a real letter takes minutes to write, and every one that passes
// the safety pipeline lands in the founder's manual review queue, so this mostly
// protects review time. 3 per 10 minutes doesn't get in the way of anyone writing.
const LETTER_RATE_LIMIT_MAX_REQUESTS = 3;
const LETTER_RATE_LIMIT_WINDOW = "10 m";

const letterRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(LETTER_RATE_LIMIT_MAX_REQUESTS, LETTER_RATE_LIMIT_WINDOW),
  prefix: "ratelimit:letters",
});

export async function isLetterRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      letterRatelimit.limit(`ip:${ip}`),
      letterRatelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

// Reading the mailbox (GET /api/mailbox). Its own budget, so opening the mailbox never
// uses up the 3 letters above. Same number as entries: someone checking for a reply opens
// it a few times at most. It also protects the keys: a seal has about 50 bits and the
// table only holds hashes peppered with a server secret (identity-keys.ts), so guessing
// through the API is what's left, and limits like this one are what slow it down.
const mailboxRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW),
  prefix: "ratelimit:mailbox",
});

export async function isMailboxRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      mailboxRatelimit.limit(`ip:${ip}`),
      mailboxRatelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

// Confirming a return key (POST /api/return-key/confirm). It answers whether a key exists,
// so it slows down guessing like the mailbox limit above. Its own budget, so confirming
// never uses up the mailbox's; a key is confirmed once, so 10 a minute leaves room for
// retries.
const returnKeyConfirmRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW),
  prefix: "ratelimit:return-key-confirm",
});

export async function isReturnKeyConfirmRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      returnKeyConfirmRatelimit.limit(`ip:${ip}`),
      returnKeyConfirmRatelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

// Asking for a visitor's seal (POST /api/return-key). Each request creates an identity, so
// this keeps one session or IP from filling the table: a visitor needs one seal for the
// phrase they're writing to, and coming back to it in the same visit reuses the one in
// memory. 5 per 10 minutes leaves room for a reload or two.
const RETURN_KEY_CREATE_RATE_LIMIT_MAX_REQUESTS = 5;
const RETURN_KEY_CREATE_RATE_LIMIT_WINDOW = "10 m";

const returnKeyCreateRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RETURN_KEY_CREATE_RATE_LIMIT_MAX_REQUESTS, RETURN_KEY_CREATE_RATE_LIMIT_WINDOW),
  prefix: "ratelimit:return-key-create",
});

export async function isReturnKeyCreateRateLimited({ ip, sessionId }: RateLimitIdentifiers): Promise<boolean> {
  try {
    const [ipResult, sessionResult] = await Promise.all([
      returnKeyCreateRatelimit.limit(`ip:${ip}`),
      returnKeyCreateRatelimit.limit(`session:${sessionId}`),
    ]);
    return !ipResult.success || !sessionResult.success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

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

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

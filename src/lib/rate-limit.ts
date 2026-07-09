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

// Blocks before any Supabase/OpenAI call is made. IP is the only signal we have pre-session (P3).
// Fails open: if Upstash itself is unreachable, we let the request through rather than taking
// down entry submission over an outage in a service that only exists to prevent abuse.
export async function isRateLimited(ip: string): Promise<boolean> {
  try {
    const { success } = await ratelimit.limit(ip);
    return !success;
  } catch (error) {
    logRequestOutcome(ip, "rate_limit_unavailable");
    console.error("Upstash rate limit check failed, failing open:", error);
    return false;
  }
}

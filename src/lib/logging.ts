import "server-only";
import { createHash } from "node:crypto";
import type { EntryOutcome } from "@/lib/entries";

export type RequestOutcome = EntryOutcome["type"] | "phrase_submitted" | "rate_limited" | "rate_limit_unavailable";

// One-way hash: enough to spot a single IP hammering the endpoint without storing it raw.
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// Never pass entry text here — outcome + hashed IP is all this should ever log.
export function logRequestOutcome(ip: string, outcome: RequestOutcome): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ipHash: hashIp(ip),
      outcome,
    })
  );
}

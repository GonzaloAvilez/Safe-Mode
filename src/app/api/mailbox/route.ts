import { getMailboxWithReturnKey } from "@/lib/mailbox";
import { isMailboxRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";

// The response carries private letters: it must never be stored by a cache.
const NO_STORE = { "Cache-Control": "no-store" };

// ADR-004 #211: whoever holds a return key reads their correspondences and the letters in
// them. The key goes in "Authorization: Bearer <key>", never in the URL.
//
// An unrecognized key gets 401, not the 404 the letters route gives: there's no
// correspondence id here whose existence a different answer could reveal.
export async function GET(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isMailboxRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const returnKey = getRequestReturnKey(request);
  if (!returnKey) return Response.json({ error: "return key required" }, { status: 401 });

  const mailbox = await getMailboxWithReturnKey(returnKey);
  if (!mailbox) return Response.json({ error: "return key not recognized" }, { status: 401 });

  return Response.json(mailbox, { headers: NO_STORE });
}

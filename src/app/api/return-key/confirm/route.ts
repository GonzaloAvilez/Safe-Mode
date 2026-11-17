import { confirmReturnKey } from "@/lib/identity-keys";
import { isReturnKeyConfirmRateLimited } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getRequestReturnKey } from "@/lib/request-return-key";
import { getOrCreateSessionId } from "@/lib/session";

// ADR-004 #212: whoever holds a return key confirms they saved it. Until then nothing
// depends on the key: a phrase whose author hasn't confirmed accepts no letters. The key
// goes in "Authorization: Bearer <key>", never in the URL. Confirming again gets the same
// answer and changes nothing.
//
// An unrecognized key gets 401, same as /api/mailbox. Not closed by letters_open:
// confirming a key writes no letter.
export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const sessionId = await getOrCreateSessionId();

  if (await isReturnKeyConfirmRateLimited({ ip, sessionId })) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  const returnKey = getRequestReturnKey(request);
  if (!returnKey) return Response.json({ error: "return key required" }, { status: 401 });

  if (!(await confirmReturnKey(returnKey))) {
    return Response.json({ error: "return key not recognized" }, { status: 401 });
  }

  return new Response(null, { status: 204 });
}

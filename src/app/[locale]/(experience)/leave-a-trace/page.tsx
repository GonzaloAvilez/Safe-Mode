import { isLettersOpen } from "@/lib/settings";
import { LeaveATraceScreen } from "./_components/leave-a-trace-screen";

// ADR-004 #212: whether letters are open decides if Leave a Trace asks about them, and the
// founder can flip it at any time from /admin, so this is read on every visit and never frozen
// at build time. (Settings caches it for 30 seconds, and the server checks again when the phrase
// arrives, so it is never the only guard.)
export const dynamic = "force-dynamic";

export default async function LeaveATracePage() {
  return <LeaveATraceScreen lettersOpen={await isLettersOpen()} />;
}

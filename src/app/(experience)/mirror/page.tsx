import { isResonateEnabled } from "@/lib/settings";
import { MirrorScreen } from "./_components/mirror-screen";

export default async function MirrorPage() {
  const resonateEnabled = await isResonateEnabled();
  return <MirrorScreen resonateEnabled={resonateEnabled} />;
}

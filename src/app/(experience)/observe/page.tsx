import { isResonateEnabled } from "@/lib/settings";
import { ObserveScreen } from "./_components/observe-screen";

export default async function ObservePage() {
  const resonateEnabled = await isResonateEnabled();
  return <ObserveScreen resonateEnabled={resonateEnabled} />;
}

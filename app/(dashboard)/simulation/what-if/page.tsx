import { WhatIfSimulation } from "@/components/simulation/what-if-simulation";
import { runMockSimulation } from "@/lib/simulation-engine";

export default function WhatIfSimulationPage() {
  const initialResult = runMockSimulation({ conditions: [] });

  return <WhatIfSimulation initialResult={initialResult} />;
}

import type { SimulationCondition, SimulationResult } from "@/lib/simulation-types";

export async function runSimulationScenario(
  conditions: SimulationCondition[],
): Promise<SimulationResult> {
  const response = await fetch("/api/simulation/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conditions }),
  });

  if (!response.ok) {
    throw new Error("Simulation request failed.");
  }

  return (await response.json()) as SimulationResult;
}

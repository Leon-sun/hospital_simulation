import { NextResponse } from "next/server";

import { runMockSimulation } from "@/lib/simulation-engine";
import type { SimulationRequest } from "@/lib/simulation-types";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SimulationRequest>;
  const result = runMockSimulation({
    conditions: Array.isArray(body.conditions) ? body.conditions : [],
  });

  return NextResponse.json(result);
}

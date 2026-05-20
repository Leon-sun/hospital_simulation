import { NextResponse } from "next/server";

import type { Priority } from "@/lib/dashboard-types";
import { computeWaitValidationReport } from "@/lib/dashboard-metric-engine";
import { priorities } from "@/lib/dashboard-filter-options";

function getFilterValue(value: string | null, allowed: readonly Priority[], fallback: Priority) {
  return value && allowed.includes(value as Priority) ? (value as Priority) : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selectedPriority = getFilterValue(searchParams.get("priority"), priorities, "All priorities");
  const report = computeWaitValidationReport(selectedPriority);
  return NextResponse.json(report);
}

import { NextResponse } from "next/server";

import { normalizeExpectedLogFilters } from "@/lib/expected-log-filters";
import { getActivityTransitionMap } from "@/services/activityTransitionMapService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = normalizeExpectedLogFilters(
    searchParams.get("timeRange"),
    searchParams.get("specialty"),
  );
  const map = await getActivityTransitionMap(filters);
  return NextResponse.json(map);
}

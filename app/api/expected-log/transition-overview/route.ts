import { NextResponse } from "next/server";

import {
  getExpectedLogTransitionOverview,
  normalizeExpectedLogFilters,
} from "@/services/expectedLogService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = normalizeExpectedLogFilters(
    searchParams.get("timeRange"),
    searchParams.get("specialty"),
  );
  const overview = await getExpectedLogTransitionOverview(filters);

  return NextResponse.json(overview);
}

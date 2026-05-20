import { NextResponse } from "next/server";

import type { DashboardFilters, Priority, Specialty } from "@/lib/dashboard-types";
import { priorities, specialties } from "@/lib/dashboard-filter-options";
import { getDashboardData } from "@/lib/get-dashboard-data";

function getFilterValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
) {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: DashboardFilters = {
    specialty: getFilterValue<Specialty>(
      searchParams.get("specialty"),
      specialties,
      "All specialties",
    ),
    priority: getFilterValue<Priority>(
      searchParams.get("priority"),
      priorities,
      "All priorities",
    ),
  };

  const data = await getDashboardData(filters);
  return NextResponse.json(data);
}

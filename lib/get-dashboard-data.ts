import "server-only";

import type { DashboardData, DashboardFilters, Specialty } from "@/lib/dashboard-types";
import { computeDashboardData } from "@/lib/dashboard-metric-engine";
import { getPredictedCaseRequestsNextWeek } from "@/services/forecastService";

function specialtyForForecast(specialty: Specialty) {
  if (specialty === "All specialties") return "All" as const;
  return specialty;
}

export async function getDashboardData(
  filters: DashboardFilters = {
    specialty: "All specialties",
    priority: "All priorities",
  },
): Promise<DashboardData> {
  const data = computeDashboardData(filters);
  if (!process.env.DATABASE_URL) {
    return data;
  }

  try {
    const predicted = await getPredictedCaseRequestsNextWeek(
      specialtyForForecast(filters.specialty),
    );
    if (predicted > 0) {
      data.kpis.predictedNewCaseRequests = predicted;
    }
  } catch {
    // Keep mock KPI when forecast views are unavailable.
  }

  return data;
}

import "server-only";

import { queryRows } from "@/lib/db";
import type { ExpectedLogSpecialty } from "@/types/expected-log";

export type NextWeekDemandRow = {
  next_state: string;
  specialty: string;
  case_priority: string | null;
  total_estimated_events: number;
  total_service_minutes: number;
};

export async function getNextWeekEventDemandSummary(
  specialty: ExpectedLogSpecialty = "All",
): Promise<NextWeekDemandRow[]> {
  const specialtyFilter = specialty === "All" ? null : specialty;
  return queryRows<NextWeekDemandRow>(`
    SELECT
      next_state,
      specialty,
      case_priority,
      total_estimated_events::float8 AS total_estimated_events,
      total_service_minutes::float8 AS total_service_minutes
    FROM vw_next_week_event_demand_summary
    WHERE ($1::text IS NULL OR specialty = $1)
    ORDER BY total_estimated_events DESC
  `, [specialtyFilter]);
}

export async function getPredictedCaseRequestsNextWeek(
  specialty: ExpectedLogSpecialty = "All",
): Promise<number> {
  const rows = await getNextWeekEventDemandSummary(specialty);
  return Math.round(
    rows
      .filter((row) => row.next_state === "CaseRequest")
      .reduce((sum, row) => sum + Number(row.total_estimated_events ?? 0), 0),
  );
}

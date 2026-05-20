import {
  expectedLogTimeRanges,
  type ExpectedLogFilters,
  type ExpectedLogSpecialty,
  type ExpectedLogTimeRange,
} from "@/types/expected-log";

const DEFAULT_FILTERS: ExpectedLogFilters = {
  timeRange: "last_4_weeks",
  specialty: "All",
};

export function normalizeExpectedLogFilters(
  timeRange?: string | null,
  specialty?: string | null,
): ExpectedLogFilters {
  const validRange = expectedLogTimeRanges.some((range) => range.value === timeRange)
    ? (timeRange as ExpectedLogTimeRange)
    : DEFAULT_FILTERS.timeRange;
  const validSpecialty = [
    "All",
    "Orthopedics",
    "Cardiology",
    "Oncology",
    "General Surgery",
    "Neurology",
  ].includes(specialty ?? "")
    ? (specialty as ExpectedLogSpecialty)
    : DEFAULT_FILTERS.specialty;

  return {
    timeRange: validRange,
    specialty: validSpecialty,
  };
}

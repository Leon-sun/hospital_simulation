import { ExpectedLogOverview } from "@/components/expected-log/ExpectedLogOverview";
import { getActivityTransitionMap } from "@/services/activityTransitionMapService";
import { getExpectedLogTransitionOverview } from "@/services/expectedLogService";

const defaultFilters = {
  timeRange: "last_4_weeks" as const,
  specialty: "All" as const,
};

export default async function ExpectedLogPage() {
  const [initialData, initialMap] = await Promise.all([
    getExpectedLogTransitionOverview(defaultFilters),
    getActivityTransitionMap(defaultFilters),
  ]);

  return <ExpectedLogOverview initialData={initialData} initialMap={initialMap} />;
}

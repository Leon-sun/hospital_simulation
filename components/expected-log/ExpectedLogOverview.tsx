"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  expectedLogSpecialties,
  expectedLogTimeRanges,
  type ExpectedLogFilters,
  type ExpectedLogSpecialty,
  type ExpectedLogTimeRange,
  type ExpectedLogTransitionOverview,
} from "@/types/expected-log";
import type { ActivityTransitionMap } from "@/types/activity-transition-map";
import { ExpectedLogGraph } from "@/components/expected-log/ExpectedLogGraph";
import { ExpectedLogSummaryCards } from "@/components/expected-log/ExpectedLogSummaryCards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExpectedLogOverviewProps = {
  initialData: ExpectedLogTransitionOverview;
  initialMap: ActivityTransitionMap;
};

export function ExpectedLogOverview({ initialData, initialMap }: ExpectedLogOverviewProps) {
  const [filters, setFilters] = useState<ExpectedLogFilters>(initialData.filters);
  const [data, setData] = useState<ExpectedLogTransitionOverview>(initialData);
  const [map, setMap] = useState<ActivityTransitionMap>(initialMap);
  const [isLoading, setIsLoading] = useState(false);

  const updateFilters = useCallback(async (nextFilters: ExpectedLogFilters) => {
    setFilters(nextFilters);
    setIsLoading(true);
    const params = new URLSearchParams({
      timeRange: nextFilters.timeRange,
      specialty: nextFilters.specialty,
    });
    const [overviewResponse, mapResponse] = await Promise.all([
      fetch(`/api/expected-log/transition-overview?${params}`),
      fetch(`/api/activity-transition-map?${params}`),
    ]);
    const nextData = (await overviewResponse.json()) as ExpectedLogTransitionOverview;
    const nextMap = (await mapResponse.json()) as ActivityTransitionMap;
    setData(nextData);
    setMap(nextMap);
    setIsLoading(false);
  }, []);

  return (
    <main className="min-w-0 flex-1">
        <header className="border-b bg-background">
          <div className="flex flex-col gap-4 px-4 py-5 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                Expected Log - Activity Transition Overview
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Expected patient flow and transition probabilities based on historical data.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="w-full sm:w-48">
                <Select
                  value={filters.timeRange}
                  onValueChange={(value) =>
                    updateFilters({
                      ...filters,
                      timeRange: value as ExpectedLogTimeRange,
                    })
                  }
                >
                  <SelectTrigger aria-label="Time range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expectedLogTimeRanges.map((range) => (
                      <SelectItem key={range.value} value={range.value}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-56">
                <Select
                  value={filters.specialty}
                  onValueChange={(value) =>
                    updateFilters({
                      ...filters,
                      specialty: value as ExpectedLogSpecialty,
                    })
                  }
                >
                  <SelectTrigger aria-label="Department or specialty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expectedLogSpecialties.map((specialty) => (
                      <SelectItem key={specialty} value={specialty}>
                        {specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-panel">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-chart-green" />
                )}
                <span>{map.dataMode === "mock" ? "Demo fallback" : "Database"}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          <ExpectedLogGraph isLoading={isLoading} map={map} />
          <ExpectedLogSummaryCards summary={data.summary} />
        </div>
    </main>
  );
}

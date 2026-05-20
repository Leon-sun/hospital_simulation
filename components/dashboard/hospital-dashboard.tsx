"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Hash,
  LineChart,
  ListChecks,
  Loader2,
  Stethoscope,
  TimerReset,
  Users,
} from "lucide-react";
import type {
  DashboardData,
  DashboardFilters,
  Priority,
  Specialty,
} from "@/lib/dashboard-types";
import { WaitTimeDistributionChart } from "@/components/dashboard/wait-time-distribution-chart";
import { priorities, specialties } from "@/lib/dashboard-filter-options";
import { cn, formatDays, formatNumber, formatPercent, formatSurgicalWait } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HospitalDashboardProps = {
  initialData: DashboardData;
};

const priorityBadgeVariant: Record<
  Exclude<Priority, "All priorities">,
  "danger" | "warning" | "secondary" | "outline"
> = {
  "Emergency 1A": "danger",
  "Urgent 1B": "warning",
  "Urgent 1C": "warning",
  "Urgent 1D": "secondary",
  "Urgent 1E": "secondary",
  Elective: "outline",
};

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Gauge;
  tone: "blue" | "cyan" | "amber" | "rose";
}) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    cyan: "bg-cyan-50 text-cyan-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-h-36 flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
              {value}
            </p>
          </div>
          <div className={cn("rounded-md p-2", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function HospitalDashboard({ initialData }: HospitalDashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>({
    specialty: "All specialties",
    priority: "All priorities",
  });
  const [data, setData] = useState<DashboardData>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      setIsLoading(true);
      const params = new URLSearchParams({
        specialty: filters.specialty,
        priority: filters.priority,
      });
      const response = await fetch(`/api/dashboard?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status})`);
      }
      const nextData = (await response.json()) as DashboardData;
      setData(nextData);
      setIsLoading(false);
    }

    loadData().catch((error) => {
      if (error.name !== "AbortError") {
        setIsLoading(false);
      }
    });

    return () => controller.abort();
  }, [filters]);

  const maxBacklog = useMemo(
    () => Math.max(...data.waitTimeSummary.map((row) => row.backlog), 1),
    [data.waitTimeSummary],
  );

  return (
    <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-16 flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stethoscope className="h-4 w-4" />
                <span>Hospital scheduling simulation</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                Queue performance dashboard
              </h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="w-full sm:w-56">
                <Select
                  value={filters.specialty}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      specialty: value as Specialty,
                    }))
                  }
                >
                  <SelectTrigger aria-label="Specialty filter">
                    <SelectValue placeholder="All specialties" />
                  </SelectTrigger>
                  <SelectContent>
                    {specialties.map((specialty) => (
                      <SelectItem key={specialty} value={specialty}>
                        {specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Select
                  value={filters.priority}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      priority: value as Priority,
                    }))
                  }
                >
                  <SelectTrigger aria-label="Priority filter">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
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
                <span className="whitespace-nowrap" suppressHydrationWarning>
                  Updated{" "}
                  {new Date(data.lastUpdated).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              title="Cases in filter"
              value={formatNumber(data.kpis.totalCasesInFilter)}
              detail="All matching scheduling cases (not backlog)"
              icon={Hash}
              tone="blue"
            />
            <KpiCard
              title="% patients exceeding standard wait time"
              value={formatPercent(data.kpis.percentOverStandard)}
              detail={`${formatPercent(data.kpis.percentOverSixMonths)} over 6 months`}
              icon={TimerReset}
              tone="rose"
            />
            <KpiCard
              title="Average surgical wait time"
              value={formatSurgicalWait(data.kpis.averageSurgicalWaitDays)}
              detail={`Median ${formatSurgicalWait(data.kpis.medianWaitDays)}`}
              icon={LineChart}
              tone="blue"
            />
            <KpiCard
              title="Backlog (ready, unscheduled)"
              value={formatNumber(data.kpis.backlog)}
              detail="Queue status = Ready only"
              icon={ListChecks}
              tone="amber"
            />
            <KpiCard
              title="Predicted new case requests"
              value={formatNumber(data.kpis.predictedNewCaseRequests)}
              detail="Based on 28-day arrival rate × pathway transitions"
              icon={Users}
              tone="cyan"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <Card className="min-w-0">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Wait Time Distribution</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Outpatient and surgery events by current wait bucket
                  </p>
                </div>
                <Badge variant="secondary">Historical wait</Badge>
              </CardHeader>
              <CardContent>
                <div className="h-80 min-h-80 w-full min-w-0">
                  <WaitTimeDistributionChart data={data.waitTimeDistribution} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Backlog Summary</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Queue composition after capacity allocation
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Outpatient</span>
                    <span className="font-medium">{formatNumber(data.backlogSummary.outpatient)}</span>
                  </div>
                  <Progress
                    value={(data.backlogSummary.outpatient / Math.max(data.kpis.backlog, 1)) * 100}
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Surgery</span>
                    <span className="font-medium">{formatNumber(data.backlogSummary.surgery)}</span>
                  </div>
                  <Progress
                    value={(data.backlogSummary.surgery / Math.max(data.kpis.backlog, 1)) * 100}
                    className="[&>div]:bg-chart-cyan"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6 border-y py-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Over 6 months</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatNumber(data.backlogSummary.overSixMonths)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">High priority</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatNumber(data.backlogSummary.highPriority)}
                    </p>
                  </div>
                </div>
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  <span className="font-semibold">
                    {formatNumber(data.kpis.predictedNewCaseRequests)}
                  </span>{" "}
                  new case requests forecast for next week
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Wait Time Summary</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  KPI view shape by specialty
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Specialty</TableHead>
                      <TableHead className="text-right">Avg wait</TableHead>
                      <TableHead className="text-right">Median</TableHead>
                      <TableHead className="text-right">P90</TableHead>
                      <TableHead className="text-right">Over std.</TableHead>
                      <TableHead className="text-right">Ready backlog</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.waitTimeSummary.map((row) => (
                      <TableRow key={row.specialty}>
                        <TableCell className="font-medium">{row.specialty}</TableCell>
                        <TableCell className="text-right">{formatSurgicalWait(row.averageWaitDays)}</TableCell>
                        <TableCell className="text-right">{formatSurgicalWait(row.medianWaitDays)}</TableCell>
                        <TableCell className="text-right">{formatSurgicalWait(row.p90WaitDays)}</TableCell>
                        <TableCell className="text-right">
                          {formatPercent(row.percentOverStandard)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex min-w-28 items-center justify-end gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-chart-amber"
                                style={{ width: `${(row.backlog / maxBacklog) * 100}%` }}
                              />
                            </div>
                            <span className="w-10 text-right">{formatNumber(row.backlog)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Surgical Status By Priority</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Surgery queue status after allocation
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Waiting</TableHead>
                      <TableHead className="text-right">Scheduled</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Avg wait</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.surgicalStatusByPriority.map((row, index) => (
                      <TableRow key={`${row.priority}-${index}`}>
                        <TableCell>
                          <Badge variant={priorityBadgeVariant[row.priority]}>
                            {row.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(row.waiting)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.scheduled)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.completedThisWeek)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatSurgicalWait(row.averageWaitDays)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>
    </main>
  );
}

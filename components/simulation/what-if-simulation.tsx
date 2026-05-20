"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { runSimulationScenario } from "@/services/simulation-client";
import {
  changeTypeOptions,
  conditionTypeOptions,
  durationOptions,
  simulationSpecialtyOptions,
  type SimulationChangeType,
  type SimulationCondition,
  type SimulationConditionType,
  type SimulationDuration,
  type SimulationResult,
  type SimulationSpecialty,
} from "@/lib/simulation-types";
import { cn, formatDays, formatNumber, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type WhatIfSimulationProps = {
  initialResult: SimulationResult;
};

function createCondition(): SimulationCondition {
  return {
    id: crypto.randomUUID(),
    conditionType: "Patient arrivals",
    changeType: "Increase",
    value: 10,
    duration: "Next 30 days",
    specialty: "All Specialties",
  };
}

function formatMetric(value: number, unit: "days" | "percent" | "count" | "utilization") {
  if (unit === "days") return formatDays(value);
  if (unit === "percent" || unit === "utilization") return formatPercent(value);
  return formatNumber(Math.round(value));
}

function deltaTone(delta: number, lowerIsBetter = true) {
  if (Math.abs(delta) < 0.05) return "text-muted-foreground";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "text-emerald-700" : "text-rose-700";
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card p-3 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex min-w-36 items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium">{formatNumber(Math.round(entry.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function KpiComparisonCard({
  title,
  metric,
  unit,
  lowerIsBetter = true,
}: {
  title: string;
  metric: { baseline: number; scenario: number; delta: number };
  unit: "days" | "percent" | "count";
  lowerIsBetter?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Scenario</p>
            <p className="mt-1 text-3xl font-semibold tracking-normal">
              {formatMetric(metric.scenario, unit)}
            </p>
          </div>
          <Badge
            variant={Math.abs(metric.delta) < 0.05 ? "secondary" : "outline"}
            className={cn("mb-1", deltaTone(metric.delta, lowerIsBetter))}
          >
            {metric.delta > 0 ? "+" : ""}
            {formatMetric(metric.delta, unit)}
          </Badge>
        </div>
        <div className="mt-5 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Baseline</span>
          <span className="font-medium">{formatMetric(metric.baseline, unit)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ConditionRow({
  condition,
  canRemove,
  onChange,
  onRemove,
}: {
  condition: SimulationCondition;
  canRemove: boolean;
  onChange: (next: SimulationCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-background p-3 xl:grid-cols-[1.45fr_0.8fr_0.75fr_1fr_1.1fr_auto]">
      <Select
        value={condition.conditionType}
        onValueChange={(value) =>
          onChange({ ...condition, conditionType: value as SimulationConditionType })
        }
      >
        <SelectTrigger aria-label="Condition type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {conditionTypeOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.changeType}
        onValueChange={(value) =>
          onChange({ ...condition, changeType: value as SimulationChangeType })
        }
      >
        <SelectTrigger aria-label="Change type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {changeTypeOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        aria-label="Value"
        min={0}
        onChange={(event) =>
          onChange({
            ...condition,
            value: Number(event.target.value),
          })
        }
        type="number"
        value={condition.value}
      />

      <Select
        value={condition.duration}
        onValueChange={(value) =>
          onChange({ ...condition, duration: value as SimulationDuration })
        }
      >
        <SelectTrigger aria-label="Duration">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {durationOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.specialty}
        onValueChange={(value) =>
          onChange({ ...condition, specialty: value as SimulationSpecialty })
        }
      >
        <SelectTrigger aria-label="Specialty">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {simulationSpecialtyOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        aria-label="Remove condition"
        disabled={!canRemove}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function WhatIfSimulation({ initialResult }: WhatIfSimulationProps) {
  const [conditions, setConditions] = useState<SimulationCondition[]>([
    createCondition(),
  ]);
  const [result, setResult] = useState<SimulationResult>(initialResult);
  const [isRunning, setIsRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeConditionLabels = useMemo(
    () =>
      conditions.map(
        (condition) =>
          `${condition.conditionType} ${condition.changeType.toLowerCase()} ${condition.value}%`,
      ),
    [conditions],
  );

  async function runScenario() {
    setIsRunning(true);
    const nextResult = await runSimulationScenario(conditions);
    setResult(nextResult);
    setIsRunning(false);
    setToast("Simulation completed. Scenario metrics updated.");
    window.setTimeout(() => setToast(null), 3200);
  }

  function resetSimulation() {
    setConditions([createCondition()]);
    setResult(initialResult);
    setToast("Simulation reset to baseline.");
    window.setTimeout(() => setToast(null), 2800);
  }

  return (
    <>
    <main className="min-w-0 flex-1">
        <header className="border-b bg-background">
          <div className="flex flex-col gap-4 px-4 py-5 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">What-if Simulation</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Model the impact of demand, capacity, or policy changes on case performance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeConditionLabels.slice(0, 3).map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
              {activeConditionLabels.length > 3 ? (
                <Badge variant="outline">+{activeConditionLabels.length - 3} more</Badge>
              ) : null}
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle>Scenario Configuration</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combine demand, capacity, staffing, and policy conditions.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setConditions((current) => [...current, createCondition()])}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  Add Condition
                </Button>
                <Button onClick={resetSimulation} type="button" variant="outline">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  className="min-w-44"
                  disabled={isRunning}
                  onClick={runScenario}
                  size="lg"
                  type="button"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Run Simulation
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden grid-cols-[1.45fr_0.8fr_0.75fr_1fr_1.1fr_auto] gap-3 px-1 text-xs font-medium uppercase text-muted-foreground xl:grid">
                <span>Condition Type</span>
                <span>Change</span>
                <span>Value</span>
                <span>Duration</span>
                <span>Specialty</span>
                <span />
              </div>
              {conditions.map((condition) => (
                <ConditionRow
                  canRemove={conditions.length > 1}
                  condition={condition}
                  key={condition.id}
                  onChange={(next) =>
                    setConditions((current) =>
                      current.map((item) => (item.id === condition.id ? next : item)),
                    )
                  }
                  onRemove={() =>
                    setConditions((current) =>
                      current.filter((item) => item.id !== condition.id),
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <KpiComparisonCard
              metric={result.kpis.percentOverStandard}
              title="% Patients Likely to Surpass Standard Wait Time"
              unit="percent"
            />
            <KpiComparisonCard
              metric={result.kpis.averageWaitTime}
              title="Average Wait Time"
              unit="days"
            />
            <KpiComparisonCard
              lowerIsBetter={false}
              metric={result.kpis.totalCasesAffected}
              title="Total Cases Affected"
              unit="count"
            />
            <KpiComparisonCard
              lowerIsBetter={false}
              metric={result.kpis.totalCasesCompleted}
              title="Total Cases Completed"
              unit="count"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <Card className="min-w-0" id="saved-scenarios">
              <CardHeader>
                <CardTitle>Wait Time Distribution</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Baseline compared with simulated scenario
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={result.waitTimeDistribution}
                      margin={{ bottom: 0, left: -18, right: 8, top: 10 }}
                    >
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                      <XAxis axisLine={false} dataKey="bucket" tickLine={false} tickMargin={10} />
                      <YAxis axisLine={false} tickLine={false} tickMargin={10} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f4f6" }} />
                      <Legend iconType="circle" />
                      <Bar dataKey="baseline" fill="#2f6fed" name="Baseline" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="scenario" fill="#1aa6a8" name="Scenario" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resource Utilization</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outpatient and OR utilization
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={result.resourceUtilization}
                      layout="vertical"
                      margin={{ bottom: 0, left: 16, right: 18, top: 10 }}
                    >
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
                      <XAxis axisLine={false} domain={[0, 100]} tickLine={false} type="number" />
                      <YAxis
                        axisLine={false}
                        dataKey="resource"
                        tickLine={false}
                        type="category"
                        width={82}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f4f6" }} />
                      <Legend iconType="circle" />
                      <Bar dataKey="baseline" fill="#7895cb" name="Baseline" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="scenario" fill="#e9a126" name="Scenario" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Queue Growth Trend</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Forecast backlog growth over the scenario horizon
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer height="100%" width="100%">
                    <AreaChart
                      data={result.queueGrowthTrend}
                      margin={{ bottom: 0, left: -18, right: 8, top: 10 }}
                    >
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                      <XAxis axisLine={false} dataKey="period" tickLine={false} tickMargin={10} />
                      <YAxis axisLine={false} tickLine={false} tickMargin={10} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend iconType="circle" />
                      <Area
                        dataKey="baseline"
                        fill="#2f6fed"
                        fillOpacity={0.12}
                        name="Baseline"
                        stroke="#2f6fed"
                        strokeWidth={2}
                        type="monotone"
                      />
                      <Line
                        dataKey="scenario"
                        name="Scenario"
                        stroke="#d84e66"
                        strokeWidth={3}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendation Engine</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Operational moves suggested for this scenario
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.recommendations.map((recommendation) => (
                  <div key={recommendation.title} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{recommendation.title}</p>
                      <Badge variant="success">
                        -{formatDays(recommendation.estimatedWaitTimeReductionDays)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {recommendation.reason}
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {recommendation.expectedImpact}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Wait Time Summary</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Baseline and scenario performance by wait standard
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Baseline</TableHead>
                      <TableHead className="text-right">Scenario</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.waitTimeSummary.map((row) => (
                      <TableRow key={row.metric}>
                        <TableCell className="font-medium">{row.metric}</TableCell>
                        <TableCell className="text-right">
                          {formatMetric(row.baseline, row.unit)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMetric(row.scenario, row.unit)}
                        </TableCell>
                        <TableCell className={cn("text-right font-medium", deltaTone(row.change))}>
                          {row.change > 0 ? "+" : ""}
                          {formatMetric(row.change, row.unit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Saved Scenarios</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recent scenario runs and performance snapshots
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Active Conditions</TableHead>
                      <TableHead className="text-right">Avg Wait</TableHead>
                      <TableHead className="text-right">% Over Std.</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.savedScenarios.map((scenario) => (
                      <TableRow key={scenario.scenarioName}>
                        <TableCell>
                          <p className="font-medium">{scenario.scenarioName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{scenario.lastRun}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-60 flex-wrap gap-1.5">
                            {scenario.activeConditions.map((condition) => (
                              <Badge key={condition} variant="secondary">
                                {condition}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDays(scenario.averageWaitTime)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercent(scenario.percentOverStandard)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" type="button" variant="ghost">
                              Load
                            </Button>
                            <Button size="sm" type="button" variant="ghost">
                              Compare
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">Queue Growth</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {result.kpis.queueGrowth.delta > 0 ? "+" : ""}
                    {formatNumber(Math.round(result.kpis.queueGrowth.delta))}
                  </p>
                </div>
                <div className="rounded-md bg-rose-50 p-2 text-rose-700">
                  <Plus className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">Surgery Utilization</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatPercent(result.kpis.surgeryUtilization.scenario)}
                  </p>
                </div>
                <div className="rounded-md bg-cyan-50 p-2 text-cyan-700">
                  <Activity className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">Outpatient Utilization</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatPercent(result.kpis.outpatientUtilization.scenario)}
                  </p>
                </div>
                <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
                  <Minus className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-md border bg-card p-4 text-sm shadow-lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-emerald-50 p-1 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">Scenario updated</p>
              <p className="mt-1 text-muted-foreground">{toast}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

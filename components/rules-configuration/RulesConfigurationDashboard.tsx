"use client";

import { useCallback, useMemo, useState } from "react";
import {
  GripVertical,
  Info,
  ListOrdered,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_TYPE_LABELS,
  AVAILABLE_FACTORS_BY_TYPE,
  buildDefaultRules,
  compareRule,
  DEFAULT_RANKING_FOR_FACTOR,
  FACTOR_DEFINITIONS,
  type AppointmentTypeId,
  type FactorKey,
  type PriorityRuleRow,
  RANKING_LOGIC_OPTIONS,
  type RankingLogic,
  SIMULATOR_VALUES,
} from "@/lib/rules-configuration/model";

type ComparisonRow = {
  order: number;
  factorKey: FactorKey;
  factorName: string;
  logic: RankingLogic;
  labelA: string;
  labelB: string;
  outcome: "tie" | "a" | "b";
  isDecisive: boolean;
};

function newRowFromFactor(type: AppointmentTypeId, factorKey: FactorKey): PriorityRuleRow {
  return {
    id: `${type}:added:${factorKey}:${crypto.randomUUID()}`,
    factorKey,
    rankingLogic: DEFAULT_RANKING_FOR_FACTOR[factorKey] ?? "High > Medium > Low",
  };
}

export function RulesConfigurationDashboard() {
  const [appointmentType, setAppointmentType] = useState<AppointmentTypeId>("new-clinic");
  const [rulesByType, setRulesByType] = useState<Record<AppointmentTypeId, PriorityRuleRow[]>>(() => ({
    "new-clinic": buildDefaultRules("new-clinic"),
    "follow-up": buildDefaultRules("follow-up"),
    "post-surgery": buildDefaultRules("post-surgery"),
  }));
  const [selectedFactor, setSelectedFactor] = useState<FactorKey | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [comparison, setComparison] = useState<{
    rows: ComparisonRow[];
    winner: "a" | "b" | "tie";
    decisiveIndex: number | null;
  } | null>(null);

  const rules = rulesByType[appointmentType];

  const availableFactors = useMemo(() => {
    const inUse = new Set(rules.map((r) => r.factorKey));
    return AVAILABLE_FACTORS_BY_TYPE[appointmentType].filter((k) => !inUse.has(k));
  }, [appointmentType, rules]);

  const setRules = useCallback(
    (next: PriorityRuleRow[] | ((prev: PriorityRuleRow[]) => PriorityRuleRow[])) => {
      setRulesByType((prev) => {
        const current = prev[appointmentType];
        const resolved = typeof next === "function" ? next(current) : next;
        return { ...prev, [appointmentType]: resolved };
      });
    },
    [appointmentType],
  );

  const onAppointmentTypeChange = (next: AppointmentTypeId) => {
    setAppointmentType(next);
    setSelectedFactor(null);
    setComparison(null);
  };

  const updateRuleLogic = (id: string, rankingLogic: RankingLogic) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, rankingLogic } : r)));
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setComparison(null);
  };

  const addPriorityFactor = () => {
    if (!selectedFactor) return;
    setRules((prev) => [...prev, newRowFromFactor(appointmentType, selectedFactor)]);
    setSelectedFactor(null);
    setComparison(null);
  };

  const resetToDefault = () => {
    setRules(buildDefaultRules(appointmentType));
    setSelectedFactor(null);
    setComparison(null);
  };

  const onDragStart = (index: number) => setDragFrom(index);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (toIndex: number) => {
    if (dragFrom === null || dragFrom === toIndex) {
      setDragFrom(null);
      return;
    }
    setRules((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragFrom(null);
  };

  const onDragEnd = () => setDragFrom(null);

  const runComparison = () => {
    let decisiveIndex: number | null = null;
    let winner: "a" | "b" | "tie" = "tie";
    const rows: ComparisonRow[] = rules.map((rule, i) => {
      const sample = SIMULATOR_VALUES[rule.factorKey];
      const { labelA, labelB, ...sim } = sample;
      const outcome = compareRule(rule.factorKey, rule.rankingLogic, sim);
      const isDecisive = decisiveIndex === null && outcome !== "tie";
      if (isDecisive) {
        decisiveIndex = i;
        winner = outcome;
      }
      return {
        order: i + 1,
        factorKey: rule.factorKey,
        factorName: FACTOR_DEFINITIONS[rule.factorKey].name,
        logic: rule.rankingLogic,
        labelA,
        labelB,
        outcome,
        isDecisive,
      };
    });
    setComparison({ rows, winner, decisiveIndex });
  };

  const appointmentTabs: AppointmentTypeId[] = ["new-clinic", "follow-up", "post-surgery"];

  return (
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-background">
          <div className="flex flex-col gap-4 px-4 py-5 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Scheduling policy
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">Rules Configuration</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Define how appointment requests compete for limited slots by appointment type. Rules
                are evaluated in order until the first decisive factor.
              </p>
            </div>
            <Button
              className="shrink-0 shadow-panel"
              onClick={() => {
                window.alert("Configuration saved (demo). In production this would persist rules.");
              }}
            >
              Save Configuration
            </Button>
          </div>
        </header>

        <main className="space-y-6 p-4 md:p-6">
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1 shadow-panel">
            {appointmentTabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onAppointmentTypeChange(id)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  appointmentType === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground",
                )}
              >
                {APPOINTMENT_TYPE_LABELS[id]}
              </button>
            ))}
          </div>

          <div className="grid flex-1 gap-6 lg:grid-cols-3">
            <Card className="border-border shadow-panel lg:col-span-2">
              <CardHeader className="border-b border-border bg-card pb-4">
                <CardTitle className="text-lg">Priority Rule Builder</CardTitle>
                <CardDescription>
                  Drag to reorder. Higher rows are evaluated first. Each factor uses the ranking logic
                  you select.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {rules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
                    No priority factors yet. Add factors from the panel on the right.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {rules.map((row, index) => {
                      const def = FACTOR_DEFINITIONS[row.factorKey];
                      const Icon = def.icon;
                      return (
                        <li
                          key={row.id}
                          draggable
                          onDragStart={() => onDragStart(index)}
                          onDragOver={onDragOver}
                          onDrop={() => onDrop(index)}
                          onDragEnd={onDragEnd}
                          className={cn(
                            "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-panel transition-shadow sm:flex-row sm:items-center",
                            dragFrom === index && "opacity-80 ring-2 ring-primary/35",
                          )}
                        >
                          <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                            <button
                              type="button"
                              className="cursor-grab rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                              aria-label="Drag to reorder"
                            >
                              <GripVertical className="h-5 w-5" />
                            </button>
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground">
                              {index + 1}
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{def.name}</span>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                            <Select
                              value={row.rankingLogic}
                              onValueChange={(v) => updateRuleLogic(row.id, v as RankingLogic)}
                            >
                              <SelectTrigger className="h-10 w-full border-border bg-card sm:max-w-xs">
                                <SelectValue placeholder="Ranking logic" />
                              </SelectTrigger>
                              <SelectContent>
                                {RANKING_LOGIC_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                title={def.description}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label={`About ${def.name}`}
                              >
                                <Info className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRule(row.id)}
                                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Remove ${def.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" disabled={!selectedFactor} onClick={addPriorityFactor}>
                    <ListOrdered className="h-4 w-4" />
                    Add Priority Factor
                  </Button>
                  <Button type="button" variant="outline" onClick={resetToDefault}>
                    Reset to Default
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-panel">
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Available Factors</CardTitle>
                <CardDescription>
                  Select a factor, then use &quot;Add Priority Factor&quot; to include it in the
                  builder.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {availableFactors.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    All factors for this appointment type are in use.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {availableFactors.map((key) => {
                      const def = FACTOR_DEFINITIONS[key];
                      const Icon = def.icon;
                      const selected = selectedFactor === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setSelectedFactor(selected ? null : key)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                              selected
                                ? "border-primary bg-primary/5 ring-2 ring-ring ring-offset-2 ring-offset-background"
                                : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
                            )}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="font-medium text-foreground">{def.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-panel">
            <CardHeader className="flex flex-col gap-2 border-b border-border sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg">Rule Test Simulator</CardTitle>
                <CardDescription className="max-w-3xl">
                  The system evaluates rules from top to bottom. The first factor with a difference
                  determines the priority.
                </CardDescription>
              </div>
              <Button type="button" onClick={runComparison} className="shrink-0 shadow-panel">
                Run Comparison
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4 shadow-panel">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Patient Request A
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Representative values for the first competing request in this scenario.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 shadow-panel">
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
                    Patient Request B
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Representative values for the second competing request in this scenario.
                  </p>
                </div>
              </div>

              {comparison ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-lg border border-border shadow-panel">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>Factor</TableHead>
                          <TableHead>Ranking logic</TableHead>
                          <TableHead>Request A</TableHead>
                          <TableHead>Request B</TableHead>
                          <TableHead>Step</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.rows.map((r) => (
                          <TableRow
                            key={`${r.order}-${r.factorKey}`}
                            className={cn(
                              r.isDecisive && "bg-primary/5 font-medium",
                            )}
                          >
                            <TableCell className="text-center text-muted-foreground">
                              {r.order}
                            </TableCell>
                            <TableCell className="text-foreground">{r.factorName}</TableCell>
                            <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                              {r.logic}
                            </TableCell>
                            <TableCell>{r.labelA}</TableCell>
                            <TableCell>{r.labelB}</TableCell>
                            <TableCell>
                              {r.outcome === "tie" && (
                                <span className="text-muted-foreground">Tie</span>
                              )}
                              {r.outcome === "a" && (
                                <span className="font-medium text-primary">A leads</span>
                              )}
                              {r.outcome === "b" && (
                                <span className="font-medium text-secondary">B leads</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg border px-4 py-3 text-sm",
                      comparison.winner === "tie"
                        ? "border-border bg-muted/40 text-foreground"
                        : "border-primary/25 bg-primary/5 text-foreground",
                    )}
                  >
                    {comparison.winner === "tie" && (
                      <span>
                        <strong>Result:</strong> No difference under the current rule stack — requests
                        remain tied after all factors.
                      </span>
                    )}
                    {comparison.winner === "a" && (
                      <span>
                        <strong>Request A ranks higher</strong> — first decisive factor is row{" "}
                        {(comparison.decisiveIndex ?? 0) + 1}.
                      </span>
                    )}
                    {comparison.winner === "b" && (
                      <span>
                        <strong>Request B ranks higher</strong> — first decisive factor is row{" "}
                        {(comparison.decisiveIndex ?? 0) + 1}.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0 text-primary" />
                  Run a comparison to see how these requests resolve with your current rule order.
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
  );
}

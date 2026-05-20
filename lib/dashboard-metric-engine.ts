import type {
  BacklogSummary,
  DashboardData,
  DashboardFilters,
  KpiSummary,
  Priority,
  Specialty,
  SurgicalStatusRow,
  WaitTimeDistributionPoint,
  WaitTimeSummaryRow,
} from "@/lib/dashboard-types";
import type { DashboardCaseRecord } from "@/lib/dashboard-case-source";
import { buildDashboardCaseRecords } from "@/lib/dashboard-case-source";

const ALL_SPECIALTIES: Exclude<Specialty, "All specialties">[] = [
  "Orthopedics",
  "Cardiology",
  "Oncology",
  "General Surgery",
  "Neurology",
];

export function maxTargetHoursForPriority(
  priority: Exclude<Priority, "All priorities">,
): number {
  switch (priority) {
    case "Emergency 1A":
      return 2;
    case "Urgent 1B":
      return 8;
    case "Urgent 1C":
      return 48;
    case "Urgent 1D":
      return 7 * 24;
    case "Urgent 1E":
      return 14 * 24;
    case "Elective":
      return 180 * 24;
    default:
      return Infinity;
  }
}

function exceedsStandard(waitHours: number, priority: Exclude<Priority, "All priorities">): boolean {
  return waitHours > maxTargetHoursForPriority(priority);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function filterCases(cases: DashboardCaseRecord[], filters: DashboardFilters): DashboardCaseRecord[] {
  return cases.filter((c) => {
    if (filters.specialty !== "All specialties" && c.specialty !== filters.specialty) return false;
    if (filters.priority !== "All priorities" && c.schedulingPriority !== filters.priority) return false;
    return true;
  });
}

function bucketForWaitDays(waitDays: number): string {
  if (waitDays <= 7) return "0-7";
  if (waitDays <= 30) return "8-30";
  if (waitDays <= 90) return "31-90";
  if (waitDays <= 180) return "91-180";
  return "181+";
}

function buildDistribution(cases: DashboardCaseRecord[]): WaitTimeDistributionPoint[] {
  const buckets = ["0-7", "8-30", "31-90", "91-180", "181+"];
  const surgeryByBucket = new Map<string, number>();
  for (const b of buckets) surgeryByBucket.set(b, 0);
  for (const c of cases) {
    const d = c.waitHours / 24;
    const b = bucketForWaitDays(d);
    surgeryByBucket.set(b, (surgeryByBucket.get(b) ?? 0) + 1);
  }
  return buckets.map((bucket) => {
    const surgery = surgeryByBucket.get(bucket) ?? 0;
    const outpatient = Math.max(0, Math.round(surgery * 0.42 + 3));
    return { bucket, outpatient, surgery };
  });
}

function buildSurgicalStatusByPriority(cases: DashboardCaseRecord[]): SurgicalStatusRow[] {
  const priorities: Exclude<Priority, "All priorities">[] = [
    "Emergency 1A",
    "Urgent 1B",
    "Urgent 1C",
    "Urgent 1D",
    "Urgent 1E",
    "Elective",
  ];
  return priorities.map((priority) => {
    const subset = cases.filter((c) => c.schedulingPriority === priority);
    const waiting = subset.filter((c) => c.queueStatus === "Ready").length;
    const scheduled = subset.filter((c) => c.queueStatus === "Scheduled").length;
    const completedThisWeek = subset.filter((c) => c.queueStatus === "Completed").length;
    const waits = subset.map((c) => c.waitHours / 24);
    return {
      priority,
      waiting,
      scheduled,
      completedThisWeek,
      averageWaitDays: mean(waits),
    };
  });
}

function buildWaitTimeSummary(all: DashboardCaseRecord[], filters: DashboardFilters): WaitTimeSummaryRow[] {
  const specs: Exclude<Specialty, "All specialties">[] =
    filters.specialty === "All specialties"
      ? ALL_SPECIALTIES
      : [filters.specialty as Exclude<Specialty, "All specialties">];

  return specs.map((specialty) => {
    const subset = filterCases(all, { specialty, priority: filters.priority });
    const waits = subset.map((c) => c.waitHours / 24).sort((a, b) => a - b);
    const over = subset.filter((c) => exceedsStandard(c.waitHours, c.schedulingPriority)).length;
    const backlog = subset.filter((c) => c.queueStatus === "Ready").length;
    return {
      specialty,
      averageWaitDays: mean(waits),
      medianWaitDays: percentile(waits, 0.5),
      p90WaitDays: percentile(waits, 0.9),
      percentOverStandard: subset.length ? (100 * over) / subset.length : 0,
      backlog,
    };
  });
}

function buildKpis(cases: DashboardCaseRecord[]): KpiSummary {
  const waitsDays = cases.map((c) => c.waitHours / 24);
  const sorted = [...waitsDays].sort((a, b) => a - b);
  const overStd = cases.filter((c) => exceedsStandard(c.waitHours, c.schedulingPriority)).length;
  const overSixMo = cases.filter((c) => c.waitHours > 180 * 24).length;

  const backlog = cases.filter((c) => c.queueStatus === "Ready").length;

  return {
    percentOverStandard: cases.length ? (100 * overStd) / cases.length : 0,
    averageSurgicalWaitDays: mean(waitsDays),
    medianWaitDays: percentile(sorted, 0.5),
    p90WaitDays: percentile(sorted, 0.9),
    backlog,
    totalCasesInFilter: cases.length,
    predictedNewCaseRequests: Math.max(40, Math.round(cases.length * 0.35)),
    addedThisWeek: Math.max(12, Math.round(cases.length * 0.08)),
    completedThisWeek: Math.max(20, Math.round(cases.length * 0.12)),
    percentOverSixMonths: cases.length ? (100 * overSixMo) / cases.length : 0,
  };
}

function buildBacklogSummary(
  cases: DashboardCaseRecord[],
  surgicalRowsDisplayed: SurgicalStatusRow[],
  distribution: WaitTimeDistributionPoint[],
  allSpecialtySurgicalRows: SurgicalStatusRow[],
): BacklogSummary {
  const surgicalBacklog = surgicalRowsDisplayed.reduce((s, r) => s + r.waiting, 0);
  const backlogReady = cases.filter((c) => c.queueStatus === "Ready").length;

  return {
    outpatient: Math.max(0, backlogReady - surgicalBacklog),
    surgery: surgicalBacklog,
    overSixMonths:
      (distribution.find((row) => row.bucket === "181+")?.outpatient ?? 0) +
      (distribution.find((row) => row.bucket === "181+")?.surgery ?? 0),
    highPriority: allSpecialtySurgicalRows
      .filter((row) => row.priority === "Emergency 1A" || row.priority === "Urgent 1B")
      .reduce((sum, row) => sum + row.waiting, 0),
    readyButUnscheduled: backlogReady,
  };
}

let cachedCases: DashboardCaseRecord[] | null = null;

function getAllCases(): DashboardCaseRecord[] {
  if (!cachedCases) cachedCases = buildDashboardCaseRecords();
  return cachedCases;
}

export function computeDashboardData(filters: DashboardFilters): DashboardData {
  const all = getAllCases();
  const cases = filterCases(all, filters);

  const specialtyScope: DashboardFilters = {
    specialty: filters.specialty,
    priority: "All priorities",
  };
  const casesForSurgicalTable = filterCases(all, specialtyScope);
  let surgicalStatusByPriority = buildSurgicalStatusByPriority(casesForSurgicalTable);
  if (filters.priority !== "All priorities") {
    surgicalStatusByPriority = surgicalStatusByPriority.filter((r) => r.priority === filters.priority);
  }

  const distribution = buildDistribution(cases);
  const waitTimeSummary = buildWaitTimeSummary(all, filters);
  const kpis = buildKpis(cases);

  const surgicalRowsForBacklog = buildSurgicalStatusByPriority(casesForSurgicalTable);

  return {
    kpis,
    waitTimeDistribution: distribution,
    waitTimeSummary,
    surgicalStatusByPriority,
    backlogSummary: buildBacklogSummary(
      cases,
      surgicalStatusByPriority,
      distribution,
      surgicalRowsForBacklog,
    ),
    lastUpdated: new Date().toISOString(),
  };
}

export type WaitValidationRow = {
  case_id: string;
  surgery_request_time: string | null;
  surgery_start_time: string | null;
  wait_hours: number | null;
  target_max_hours: number;
  exceeded_target: boolean | null;
};

export type WaitValidationReport = {
  count_cases_selected_priority: number;
  average_surgery_request_to_surgery_hours_by_priority: {
    priority: string;
    avg_wait_hours: number;
    case_count: number;
  }[];
  median_wait_hours_by_priority: { priority: string; median_wait_hours: number; case_count: number }[];
  percent_over_target_max_by_priority: { priority: string; pct_over: number; case_count: number }[];
  sample_10_timelines_urgent_1b: WaitValidationRow[];
};

function isoPlusHours(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 3600 * 1000).toISOString();
}

export function computeWaitValidationReport(selectedPriority: Priority): WaitValidationReport {
  const all = getAllCases();
  const base = new Date("2023-01-01T07:00:00.000Z");

  const priorities: Exclude<Priority, "All priorities">[] = [
    "Emergency 1A",
    "Urgent 1B",
    "Urgent 1C",
    "Urgent 1D",
    "Urgent 1E",
    "Elective",
  ];

  const average_surgery_request_to_surgery_hours_by_priority = priorities.map((p) => {
    const subset = all.filter((c) => c.schedulingPriority === p);
    return {
      priority: p,
      avg_wait_hours: mean(subset.map((c) => c.waitHours)),
      case_count: subset.length,
    };
  });

  const median_wait_hours_by_priority = priorities.map((p) => {
    const sorted = all
      .filter((c) => c.schedulingPriority === p)
      .map((c) => c.waitHours)
      .sort((a, b) => a - b);
    return {
      priority: p,
      median_wait_hours: percentile(sorted, 0.5),
      case_count: sorted.length,
    };
  });

  const percent_over_target_max_by_priority = priorities.map((p) => {
    const subset = all.filter((c) => c.schedulingPriority === p);
    const maxH = maxTargetHoursForPriority(p);
    const over = subset.filter((c) => c.waitHours > maxH).length;
    return {
      priority: p,
      pct_over: subset.length ? (100 * over) / subset.length : 0,
      case_count: subset.length,
    };
  });

  const selectedCases =
    selectedPriority === "All priorities"
      ? all
      : all.filter((c) => c.schedulingPriority === selectedPriority);

  const urgent1b = all.filter((c) => c.schedulingPriority === "Urgent 1B");
  const max1b = maxTargetHoursForPriority("Urgent 1B");

  const sample_10_timelines_urgent_1b: WaitValidationRow[] = urgent1b.slice(0, 10).map((c) => {
    const n = Number.parseInt(c.caseId.replace("case-", ""), 10) || 0;
    const reqStart = new Date(base.getTime() + n * 21 * 3600 * 1000);
    return {
      case_id: c.caseId,
      surgery_request_time: reqStart.toISOString(),
      surgery_start_time: isoPlusHours(reqStart, c.waitHours),
      wait_hours: c.waitHours,
      target_max_hours: max1b,
      exceeded_target: c.waitHours > max1b,
    };
  });

  return {
    count_cases_selected_priority: selectedCases.length,
    average_surgery_request_to_surgery_hours_by_priority,
    median_wait_hours_by_priority,
    percent_over_target_max_by_priority,
    sample_10_timelines_urgent_1b,
  };
}

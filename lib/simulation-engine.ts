import type {
  QueueGrowthPoint,
  Recommendation,
  ResourceUtilizationPoint,
  SavedScenario,
  SimulationCondition,
  SimulationKpis,
  SimulationMetric,
  SimulationRequest,
  SimulationResult,
  WaitBucket,
  WaitTimeSummaryRow,
} from "@/lib/simulation-types";

type BaselineEvent = {
  id: number;
  queue: "Outpatient" | "Surgery";
  specialty: string;
  priority: "Emergency 1A" | "Urgent 1B" | "Urgent 1C" | "Urgent 1D" | "Elective";
  waitDays: number;
  standardDays: number;
  completed: boolean;
};

type SimulationFactors = {
  arrivalMultiplier: number;
  emergencyMultiplier: number;
  electiveMultiplier: number;
  surgeryDemandMultiplier: number;
  outpatientDemandMultiplier: number;
  oncologyDemandMultiplier: number;
  followUpMultiplier: number;
  mriDemandMultiplier: number;
  outpatientCapacityMultiplier: number;
  surgeryCapacityMultiplier: number;
  staffingMultiplier: number;
  surgeonMultiplier: number;
  priorityPolicyMultiplier: number;
  overtimeMultiplier: number;
  targetedSpecialties: Set<string>;
};

const WAIT_BUCKETS = [
  { bucket: "0-1 month", min: 0, max: 30 },
  { bucket: "1-2 months", min: 31, max: 60 },
  { bucket: "2-3 months", min: 61, max: 90 },
  { bucket: "3-6 months", min: 91, max: 180 },
  { bucket: "6-12 months", min: 181, max: 365 },
  { bucket: "12+ months", min: 366, max: Number.POSITIVE_INFINITY },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function metric(baseline: number, scenario: number): SimulationMetric {
  return {
    baseline: round(baseline),
    scenario: round(scenario),
    delta: round(scenario - baseline),
  };
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function seededNoise(index: number) {
  const raw = Math.sin(index * 9283.17) * 10000;
  return raw - Math.floor(raw);
}

export function generateBaselineOperationalData(count = 1000): BaselineEvent[] {
  const specialties = [
    "Orthopedics",
    "Cardiology",
    "Oncology",
    "General Surgery",
    "Neurology",
  ];
  const priorities: BaselineEvent["priority"][] = [
    "Emergency 1A",
    "Urgent 1B",
    "Urgent 1C",
    "Urgent 1D",
    "Elective",
  ];
  const events: BaselineEvent[] = [];

  for (let index = 0; index < count; index += 1) {
    const specialty = specialties[index % specialties.length];
    const priorityPick = seededNoise(index + 13);
    const priority =
      priorityPick < 0.08
        ? priorities[0]
        : priorityPick < 0.22
          ? priorities[1]
          : priorityPick < 0.45
            ? priorities[2]
            : priorityPick < 0.7
              ? priorities[3]
              : priorities[4];
    const queue = seededNoise(index + 29) < 0.32 ? "Surgery" : "Outpatient";
    const baseWait =
      priority === "Emergency 1A"
        ? 3
        : priority === "Urgent 1B"
          ? 18
          : priority === "Urgent 1C"
            ? 54
            : priority === "Urgent 1D"
              ? 96
              : 142;
    const specialtyWeight =
      specialty === "Neurology"
        ? 1.22
        : specialty === "Orthopedics"
          ? 1.1
          : specialty === "Cardiology"
            ? 0.82
            : specialty === "Oncology"
              ? 0.95
              : 1.04;
    const waitDays = Math.max(
      1,
      Math.round((baseWait + seededNoise(index + 71) * 120) * specialtyWeight),
    );
    const standardDays =
      priority === "Emergency 1A"
        ? 7
        : priority === "Urgent 1B"
          ? 28
          : priority === "Urgent 1C"
            ? 60
            : priority === "Urgent 1D"
              ? 120
              : 182;
    events.push({
      id: index + 1,
      queue,
      specialty,
      priority,
      waitDays,
      standardDays,
      completed: seededNoise(index + 101) > 0.54,
    });
  }

  return events;
}

function conditionScopeMultiplier(condition: SimulationCondition) {
  const value = Math.max(0, Number(condition.value || 0)) / 100;
  const sign = condition.changeType === "Increase" ? 1 : -1;
  return 1 + sign * value;
}

function durationWeight(condition: SimulationCondition) {
  switch (condition.duration) {
    case "Today":
      return 0.08;
    case "Next 7 days":
      return 0.28;
    case "Next 2 weeks":
      return 0.48;
    case "Next 30 days":
      return 1;
    case "Next 3 months":
      return 1.35;
    case "Permanent":
      return 1.55;
    default:
      return 1;
  }
}

function buildFactors(conditions: SimulationCondition[]): SimulationFactors {
  const factors: SimulationFactors = {
    arrivalMultiplier: 1,
    emergencyMultiplier: 1,
    electiveMultiplier: 1,
    surgeryDemandMultiplier: 1,
    outpatientDemandMultiplier: 1,
    oncologyDemandMultiplier: 1,
    followUpMultiplier: 1,
    mriDemandMultiplier: 1,
    outpatientCapacityMultiplier: 1,
    surgeryCapacityMultiplier: 1,
    staffingMultiplier: 1,
    surgeonMultiplier: 1,
    priorityPolicyMultiplier: 1,
    overtimeMultiplier: 1,
    targetedSpecialties: new Set<string>(),
  };

  for (const condition of conditions) {
    const multiplier = 1 + (conditionScopeMultiplier(condition) - 1) * durationWeight(condition);
    if (condition.specialty !== "All Specialties") {
      factors.targetedSpecialties.add(condition.specialty);
    }

    switch (condition.conditionType) {
      case "Patient arrivals":
        factors.arrivalMultiplier *= multiplier;
        break;
      case "Emergency case request surge":
        factors.emergencyMultiplier *= multiplier;
        break;
      case "Elective referrals":
        factors.electiveMultiplier *= multiplier;
        break;
      case "Oncology referrals":
        factors.oncologyDemandMultiplier *= multiplier;
        break;
      case "Surgery demand":
        factors.surgeryDemandMultiplier *= multiplier;
        break;
      case "Follow-up demand":
      case "Outpatient clinic demand":
      case "MRI demand":
        factors.outpatientDemandMultiplier *= multiplier;
        if (condition.conditionType === "Follow-up demand") {
          factors.followUpMultiplier *= multiplier;
        }
        if (condition.conditionType === "MRI demand") {
          factors.mriDemandMultiplier *= multiplier;
        }
        break;
      case "OR utilization target":
        factors.overtimeMultiplier *= multiplier;
        break;
      case "Clinic staffing":
        factors.staffingMultiplier *= multiplier;
        factors.outpatientCapacityMultiplier *= multiplier;
        break;
      case "Surgeon availability":
        factors.surgeonMultiplier *= multiplier;
        factors.surgeryCapacityMultiplier *= multiplier;
        break;
      case "Surgery room capacity":
        factors.surgeryCapacityMultiplier *= multiplier;
        break;
      case "Outpatient capacity":
        factors.outpatientCapacityMultiplier *= multiplier;
        break;
      case "Scheduling priority policy":
        factors.priorityPolicyMultiplier *= multiplier;
        break;
    }
  }

  return factors;
}

function appliesToSpecialty(event: BaselineEvent, factors: SimulationFactors) {
  return !factors.targetedSpecialties.size || factors.targetedSpecialties.has(event.specialty);
}

function scenarioWaitDays(event: BaselineEvent, factors: SimulationFactors) {
  let demandPressure = factors.arrivalMultiplier;
  let capacityRelief =
    event.queue === "Surgery"
      ? factors.surgeryCapacityMultiplier * factors.surgeonMultiplier * factors.overtimeMultiplier
      : factors.outpatientCapacityMultiplier * factors.staffingMultiplier;

  if (event.queue === "Surgery") {
    demandPressure *= factors.surgeryDemandMultiplier;
  } else {
    demandPressure *= factors.outpatientDemandMultiplier * factors.followUpMultiplier * factors.mriDemandMultiplier;
  }

  if (event.priority === "Emergency 1A") {
    demandPressure *= factors.emergencyMultiplier;
  }
  if (event.priority === "Elective") {
    demandPressure *= factors.electiveMultiplier;
  }
  if (event.specialty === "Oncology") {
    demandPressure *= factors.oncologyDemandMultiplier;
  }
  if (!appliesToSpecialty(event, factors)) {
    demandPressure = 1 + (demandPressure - 1) * 0.28;
    capacityRelief = 1 + (capacityRelief - 1) * 0.18;
  }

  const priorityRelief =
    event.priority === "Emergency 1A" || event.priority === "Urgent 1B"
      ? factors.priorityPolicyMultiplier
      : 1;
  const pressure = clamp(demandPressure / Math.max(0.25, capacityRelief * priorityRelief), 0.45, 2.8);
  return Math.max(1, event.waitDays * pressure);
}

function summarize(events: BaselineEvent[], scenarioWaits?: number[]) {
  const waits = scenarioWaits ?? events.map((event) => event.waitDays);
  const backlog = events.filter((event) => !event.completed).length;
  const completed = events.filter((event) => event.completed).length;
  const overStandard = events.filter((event, index) => waits[index] > event.standardDays).length;
  const surgeryEvents = events.filter((event) => event.queue === "Surgery");
  const outpatientEvents = events.filter((event) => event.queue === "Outpatient");

  return {
    backlog,
    completed,
    averageWaitTime: waits.reduce((sum, wait) => sum + wait, 0) / Math.max(1, waits.length),
    medianWaitTime: percentile(waits, 0.5),
    p90WaitTime: percentile(waits, 0.9),
    percentOverStandard: (overStandard / Math.max(1, events.length)) * 100,
    queueGrowth: backlog - completed,
    surgeryUtilization: Math.min(99, 68 + surgeryEvents.length / Math.max(1, events.length) * 72),
    outpatientUtilization: Math.min(99, 62 + outpatientEvents.length / Math.max(1, events.length) * 48),
  };
}

function buildDistribution(events: BaselineEvent[], scenarioWaits: number[]): WaitBucket[] {
  return WAIT_BUCKETS.map((bucket) => ({
    bucket: bucket.bucket,
    baseline: events.filter(
      (event) => event.waitDays >= bucket.min && event.waitDays <= bucket.max,
    ).length,
    scenario: events.filter(
      (_event, index) => scenarioWaits[index] >= bucket.min && scenarioWaits[index] <= bucket.max,
    ).length,
  }));
}

function buildQueueGrowthTrend(
  baselineBacklog: number,
  scenarioBacklog: number,
): QueueGrowthPoint[] {
  const periods = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
  return periods.map((period, index) => {
    const step = index + 1;
    return {
      period,
      baseline: Math.round(baselineBacklog + step * 18 + seededNoise(step) * 16),
      scenario: Math.round(scenarioBacklog + step * 24 + seededNoise(step + 31) * 22),
    };
  });
}

function buildResourceUtilization(
  baseline: ReturnType<typeof summarize>,
  scenario: ReturnType<typeof summarize>,
): ResourceUtilizationPoint[] {
  return [
    {
      resource: "Outpatient",
      baseline: round(baseline.outpatientUtilization),
      scenario: round(scenario.outpatientUtilization),
    },
    {
      resource: "OR",
      baseline: round(baseline.surgeryUtilization),
      scenario: round(scenario.surgeryUtilization),
    },
  ];
}

function buildRecommendations(
  conditions: SimulationCondition[],
  kpis: SimulationKpis,
): Recommendation[] {
  const hasSurgeryDemand = conditions.some((condition) =>
    ["Surgery demand", "Emergency case request surge", "Surgery room capacity"].includes(
      condition.conditionType,
    ),
  );
  const hasOutpatientDemand = conditions.some((condition) =>
    ["Patient arrivals", "Follow-up demand", "Outpatient clinic demand"].includes(
      condition.conditionType,
    ),
  );
  const hasOncology = conditions.some(
    (condition) =>
      condition.conditionType === "Oncology referrals" || condition.specialty === "Oncology",
  );

  const recommendations: Recommendation[] = [
    {
      title: "Add 1 orthopedic clinic session/week",
      reason: "Orthopedics has a high backlog share and medium acuity demand is sensitive to clinic capacity.",
      expectedImpact: "Moves routine and urgent follow-ups out of the 3-6 month bucket.",
      estimatedWaitTimeReductionDays: hasOutpatientDemand ? 11.5 : 7.4,
    },
    {
      title: "Add evening outpatient clinic",
      reason: "Outpatient utilization remains above target while new case requests continue to grow.",
      expectedImpact: "Improves completion throughput without drawing on OR time.",
      estimatedWaitTimeReductionDays: 8.2,
    },
    {
      title: "Increase OR capacity by 10%",
      reason: hasSurgeryDemand
        ? "Scenario conditions increase surgical pressure and OR utilization is nearing saturation."
        : "A moderate block-time increase protects surgical wait performance.",
      expectedImpact: "Reduces surgery queue growth and p90 wait time.",
      estimatedWaitTimeReductionDays: 14.7,
    },
    {
      title: "Prioritize oncology follow-ups",
      reason: hasOncology
        ? "Oncology-specific demand is elevated in the scenario."
        : "Oncology follow-ups have higher clinical risk if they cross standard wait thresholds.",
      expectedImpact: "Reduces percent exceeding standard wait time for high-risk follow-ups.",
      estimatedWaitTimeReductionDays: 9.6,
    },
    {
      title: "Reduce elective scheduling",
      reason: "Elective volume can be temporarily throttled to protect emergency and urgent access.",
      expectedImpact: "Creates short-term capacity for higher priority cases.",
      estimatedWaitTimeReductionDays: Math.max(5.1, kpis.averageWaitTime.delta * 0.18),
    },
  ];

  return recommendations
    .sort((a, b) => b.estimatedWaitTimeReductionDays - a.estimatedWaitTimeReductionDays)
    .slice(0, 4);
}

function buildSavedScenarios(resultAverageWait: number, resultPercentOver: number): SavedScenario[] {
  return [
    {
      scenarioName: "Orthopedic clinic expansion",
      activeConditions: ["Outpatient capacity +15%", "Clinic staffing +10%"],
      lastRun: "Today 09:40",
      averageWaitTime: 68.4,
      percentOverStandard: 24.8,
    },
    {
      scenarioName: "Emergency surge response",
      activeConditions: ["Emergency surge +20%", "OR capacity +10%"],
      lastRun: "Yesterday 16:25",
      averageWaitTime: 81.2,
      percentOverStandard: 31.1,
    },
    {
      scenarioName: "Current draft",
      activeConditions: ["Active condition set"],
      lastRun: "Just now",
      averageWaitTime: round(resultAverageWait),
      percentOverStandard: round(resultPercentOver),
    },
  ];
}

export function runMockSimulation(request: SimulationRequest): SimulationResult {
  const events = generateBaselineOperationalData(1000);
  const factors = buildFactors(request.conditions);
  const scenarioWaits = events.map((event) => scenarioWaitDays(event, factors));
  const baselineSummary = summarize(events);
  const scenarioSummary = summarize(events, scenarioWaits);

  const demandFactor = Math.max(
    factors.arrivalMultiplier,
    factors.emergencyMultiplier,
    factors.electiveMultiplier,
    factors.surgeryDemandMultiplier,
    factors.outpatientDemandMultiplier,
    factors.oncologyDemandMultiplier,
  );
  const capacityFactor =
    (factors.outpatientCapacityMultiplier + factors.surgeryCapacityMultiplier) / 2;
  const scenarioCasesAffected = Math.round(
    events.length * clamp(demandFactor / Math.max(0.4, capacityFactor), 0.65, 1.7),
  );
  const baselineCasesAffected = events.length;
  const scenarioCompleted = Math.round(
    baselineSummary.completed * clamp(capacityFactor / Math.max(0.7, demandFactor), 0.55, 1.28),
  );

  const kpis: SimulationKpis = {
    percentOverStandard: metric(
      baselineSummary.percentOverStandard,
      scenarioSummary.percentOverStandard,
    ),
    averageWaitTime: metric(baselineSummary.averageWaitTime, scenarioSummary.averageWaitTime),
    totalCasesAffected: metric(baselineCasesAffected, scenarioCasesAffected),
    totalCasesCompleted: metric(baselineSummary.completed, scenarioCompleted),
    medianWaitTime: metric(baselineSummary.medianWaitTime, scenarioSummary.medianWaitTime),
    p90WaitTime: metric(baselineSummary.p90WaitTime, scenarioSummary.p90WaitTime),
    queueGrowth: metric(
      baselineSummary.queueGrowth,
      scenarioSummary.queueGrowth + (scenarioCasesAffected - baselineCasesAffected),
    ),
    surgeryUtilization: metric(
      baselineSummary.surgeryUtilization,
      clamp(
        baselineSummary.surgeryUtilization *
          factors.surgeryDemandMultiplier /
          Math.max(0.5, factors.surgeryCapacityMultiplier),
        35,
        99,
      ),
    ),
    outpatientUtilization: metric(
      baselineSummary.outpatientUtilization,
      clamp(
        baselineSummary.outpatientUtilization *
          factors.outpatientDemandMultiplier /
          Math.max(0.5, factors.outpatientCapacityMultiplier),
        35,
        99,
      ),
    ),
  };

  const waitTimeSummary: WaitTimeSummaryRow[] = [
    {
      metric: "Average Wait Time",
      baseline: round(baselineSummary.averageWaitTime),
      scenario: round(scenarioSummary.averageWaitTime),
      change: round(scenarioSummary.averageWaitTime - baselineSummary.averageWaitTime),
      unit: "days",
    },
    {
      metric: "Median Wait Time",
      baseline: round(baselineSummary.medianWaitTime),
      scenario: round(scenarioSummary.medianWaitTime),
      change: round(scenarioSummary.medianWaitTime - baselineSummary.medianWaitTime),
      unit: "days",
    },
    {
      metric: "90th Percentile",
      baseline: round(baselineSummary.p90WaitTime),
      scenario: round(scenarioSummary.p90WaitTime),
      change: round(scenarioSummary.p90WaitTime - baselineSummary.p90WaitTime),
      unit: "days",
    },
    {
      metric: "% > Standard",
      baseline: round(baselineSummary.percentOverStandard),
      scenario: round(scenarioSummary.percentOverStandard),
      change: round(scenarioSummary.percentOverStandard - baselineSummary.percentOverStandard),
      unit: "percent",
    },
  ];

  const scenarioBacklog = Math.max(
    0,
    baselineSummary.backlog +
      Math.round((scenarioCasesAffected - baselineCasesAffected) * 0.7) -
      Math.max(0, scenarioCompleted - baselineSummary.completed),
  );

  return {
    runId: `sim_${Date.now().toString(36)}`,
    baselineEvents: events.length,
    outpatientQueue: events.filter((event) => event.queue === "Outpatient" && !event.completed).length,
    surgeryQueue: events.filter((event) => event.queue === "Surgery" && !event.completed).length,
    backlog: metric(baselineSummary.backlog, scenarioBacklog),
    kpis,
    waitTimeDistribution: buildDistribution(events, scenarioWaits),
    queueGrowthTrend: buildQueueGrowthTrend(baselineSummary.backlog, scenarioBacklog),
    resourceUtilization: buildResourceUtilization(baselineSummary, {
      ...scenarioSummary,
      surgeryUtilization: kpis.surgeryUtilization.scenario,
      outpatientUtilization: kpis.outpatientUtilization.scenario,
    }),
    waitTimeSummary,
    recommendations: buildRecommendations(request.conditions, kpis),
    savedScenarios: buildSavedScenarios(
      scenarioSummary.averageWaitTime,
      scenarioSummary.percentOverStandard,
    ),
    generatedAt: "2026-05-12T13:56:00-04:00",
  };
}

export type SimulationConditionType =
  | "Patient arrivals"
  | "Emergency case request surge"
  | "Elective referrals"
  | "Oncology referrals"
  | "Surgery demand"
  | "Follow-up demand"
  | "Outpatient clinic demand"
  | "MRI demand"
  | "OR utilization target"
  | "Clinic staffing"
  | "Surgeon availability"
  | "Surgery room capacity"
  | "Outpatient capacity"
  | "Scheduling priority policy";

export type SimulationChangeType = "Increase" | "Decrease";

export type SimulationDuration =
  | "Today"
  | "Next 7 days"
  | "Next 2 weeks"
  | "Next 30 days"
  | "Next 3 months"
  | "Permanent";

export type SimulationSpecialty =
  | "All Specialties"
  | "Orthopedics"
  | "Cardiology"
  | "Oncology"
  | "General Surgery"
  | "Neurology";

export type SimulationCondition = {
  id: string;
  conditionType: SimulationConditionType;
  changeType: SimulationChangeType;
  value: number;
  duration: SimulationDuration;
  specialty: SimulationSpecialty;
};

export type SimulationRequest = {
  conditions: SimulationCondition[];
};

export type SimulationMetric = {
  baseline: number;
  scenario: number;
  delta: number;
};

export type SimulationKpis = {
  percentOverStandard: SimulationMetric;
  averageWaitTime: SimulationMetric;
  totalCasesAffected: SimulationMetric;
  totalCasesCompleted: SimulationMetric;
  medianWaitTime: SimulationMetric;
  p90WaitTime: SimulationMetric;
  queueGrowth: SimulationMetric;
  surgeryUtilization: SimulationMetric;
  outpatientUtilization: SimulationMetric;
};

export type WaitBucket = {
  bucket: string;
  baseline: number;
  scenario: number;
};

export type QueueGrowthPoint = {
  period: string;
  baseline: number;
  scenario: number;
};

export type ResourceUtilizationPoint = {
  resource: string;
  baseline: number;
  scenario: number;
};

export type WaitTimeSummaryRow = {
  metric: string;
  baseline: number;
  scenario: number;
  change: number;
  unit: "days" | "percent";
};

export type Recommendation = {
  title: string;
  reason: string;
  expectedImpact: string;
  estimatedWaitTimeReductionDays: number;
};

export type SavedScenario = {
  scenarioName: string;
  activeConditions: string[];
  lastRun: string;
  averageWaitTime: number;
  percentOverStandard: number;
};

export type SimulationResult = {
  runId: string;
  baselineEvents: number;
  outpatientQueue: number;
  surgeryQueue: number;
  backlog: SimulationMetric;
  kpis: SimulationKpis;
  waitTimeDistribution: WaitBucket[];
  queueGrowthTrend: QueueGrowthPoint[];
  resourceUtilization: ResourceUtilizationPoint[];
  waitTimeSummary: WaitTimeSummaryRow[];
  recommendations: Recommendation[];
  savedScenarios: SavedScenario[];
  generatedAt: string;
};

export const conditionTypeOptions: SimulationConditionType[] = [
  "Patient arrivals",
  "Emergency case request surge",
  "Elective referrals",
  "Oncology referrals",
  "Surgery demand",
  "Follow-up demand",
  "Outpatient clinic demand",
  "MRI demand",
  "OR utilization target",
  "Clinic staffing",
  "Surgeon availability",
  "Surgery room capacity",
  "Outpatient capacity",
  "Scheduling priority policy",
];

export const changeTypeOptions: SimulationChangeType[] = ["Increase", "Decrease"];

export const durationOptions: SimulationDuration[] = [
  "Today",
  "Next 7 days",
  "Next 2 weeks",
  "Next 30 days",
  "Next 3 months",
  "Permanent",
];

export const simulationSpecialtyOptions: SimulationSpecialty[] = [
  "All Specialties",
  "Orthopedics",
  "Cardiology",
  "Oncology",
  "General Surgery",
  "Neurology",
];

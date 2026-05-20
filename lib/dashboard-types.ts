export type Specialty =
  | "All specialties"
  | "Orthopedics"
  | "Cardiology"
  | "Oncology"
  | "General Surgery"
  | "Neurology";

export type Priority =
  | "All priorities"
  | "Emergency 1A"
  | "Urgent 1B"
  | "Urgent 1C"
  | "Urgent 1D"
  | "Urgent 1E"
  | "Elective";

export type KpiSummary = {
  percentOverStandard: number;
  averageSurgicalWaitDays: number;
  /** Ready (not yet scheduled) cases in the current filter */
  backlog: number;
  /** All cases matching specialty + priority filters (e.g. 1,500 when Elective + all specialties) */
  totalCasesInFilter: number;
  predictedNewCaseRequests: number;
  addedThisWeek: number;
  completedThisWeek: number;
  medianWaitDays: number;
  p90WaitDays: number;
  percentOverSixMonths: number;
};

export type WaitTimeDistributionPoint = {
  bucket: string;
  outpatient: number;
  surgery: number;
};

export type WaitTimeSummaryRow = {
  specialty: Exclude<Specialty, "All specialties">;
  averageWaitDays: number;
  medianWaitDays: number;
  p90WaitDays: number;
  percentOverStandard: number;
  backlog: number;
};

export type SurgicalStatusRow = {
  priority: Exclude<Priority, "All priorities">;
  waiting: number;
  scheduled: number;
  completedThisWeek: number;
  averageWaitDays: number;
};

export type BacklogSummary = {
  outpatient: number;
  surgery: number;
  overSixMonths: number;
  highPriority: number;
  readyButUnscheduled: number;
};

export type DashboardData = {
  kpis: KpiSummary;
  waitTimeDistribution: WaitTimeDistributionPoint[];
  waitTimeSummary: WaitTimeSummaryRow[];
  surgicalStatusByPriority: SurgicalStatusRow[];
  backlogSummary: BacklogSummary;
  lastUpdated: string;
};

export type DashboardFilters = {
  specialty: Specialty;
  priority: Priority;
};

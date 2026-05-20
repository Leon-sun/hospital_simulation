export type ExpectedLogTimeRange =
  | "last_4_weeks"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months";

export type ExpectedLogSpecialty =
  | "All"
  | "Orthopedics"
  | "Cardiology"
  | "Oncology"
  | "General Surgery"
  | "Neurology";

export type ExpectedLogFilters = {
  timeRange: ExpectedLogTimeRange;
  specialty: ExpectedLogSpecialty;
};

export type EntrySource = {
  entryPointId: string;
  entryPointName: string;
  count: number;
  percentage: number;
};

export type ExpectedLogNode = {
  nodeId: string;
  label: string;
  eventCategory: "Entry" | "Outpatient" | "Surgery" | "Terminal";
  expectedCount: number;
  status: "waiting" | "completed";
};

export type ExpectedLogEdge = {
  source: string;
  target: string;
  transitionType: "primary" | "repeat" | "exit";
  probability: number;
  expectedCount: number;
};

export type ExpectedLogSummary = {
  totalExpectedEntries: number;
  waitingInQueueTotal: number;
  followUpVisitsTotal: number;
  dischargesTotal: number;
};

export type ExpectedLogTransitionOverview = {
  filters: ExpectedLogFilters;
  entrySources: EntrySource[];
  nodes: ExpectedLogNode[];
  edges: ExpectedLogEdge[];
  summary: ExpectedLogSummary;
  generatedAt: string;
  dataMode: "mock" | "database";
};

export const expectedLogTimeRanges: Array<{
  label: string;
  value: ExpectedLogTimeRange;
  days: number;
}> = [
  { label: "Last 4 Weeks", value: "last_4_weeks", days: 28 },
  { label: "Last 3 Months", value: "last_3_months", days: 90 },
  { label: "Last 6 Months", value: "last_6_months", days: 180 },
  { label: "Last 12 Months", value: "last_12_months", days: 365 },
];

export const expectedLogSpecialties: ExpectedLogSpecialty[] = [
  "All",
  "Orthopedics",
  "Cardiology",
  "Oncology",
  "General Surgery",
  "Neurology",
];

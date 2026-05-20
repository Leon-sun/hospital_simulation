import type { ExpectedLogFilters } from "@/types/expected-log";

export type ActivityTransitionMapNodeType = "entry" | "activity" | "exit";

export type ActivityTransitionMapColumn = 1 | 2 | 3 | 4;

export type ActivityTransitionMapNode = {
  id: string;
  type: ActivityTransitionMapNodeType;
  label: string;
  count: number;
  percent: number;
  column: ActivityTransitionMapColumn;
  status?: "waiting" | "completed";
  eventCategory?: "Entry" | "Outpatient" | "Surgery" | "Terminal";
};

export type ActivityTransitionMapEdgeType = "entry" | "primary" | "repeat" | "exit";

export type ActivityTransitionMapEdge = {
  id: string;
  source: string;
  target: string;
  probability: number;
  label: string;
  edgeType: ActivityTransitionMapEdgeType;
  expectedCount: number;
  entryPointName?: string;
};

export type ActivityTransitionMap = {
  filters: ExpectedLogFilters;
  nodes: ActivityTransitionMapNode[];
  /** Display edges (entry hops preserved; activity hops merged). */
  edges: ActivityTransitionMapEdge[];
  /** Full pathway edges for entry-point highlight paths. */
  pathEdges: ActivityTransitionMapEdge[];
  generatedAt: string;
  dataMode: "mock" | "database";
};

import type { Edge, Node } from "@xyflow/react";

import type { ActivityTransitionMapEdgeType } from "@/types/activity-transition-map";

export type ExpectedLogGraphNodeData = Record<string, unknown> & {
  label: string;
  count: number;
  percent?: number;
  status?: "waiting" | "completed";
  eventCategory?: "Entry" | "Outpatient" | "Surgery" | "Terminal";
  detail?: string;
  compact?: boolean;
  dimmed?: boolean;
  selected?: boolean;
};

export type ExpectedLogGraphEdgeData = Record<string, unknown> & {
  label: string;
  edgeType: ActivityTransitionMapEdgeType;
  probability: number;
  expectedCount?: number;
  entryPointName?: string;
  dimmed?: boolean;
  dashed?: boolean;
};

export type ExpectedLogGraphNode = Node<
  ExpectedLogGraphNodeData,
  "entrySource" | "activity" | "exit"
>;

export type ExpectedLogGraphEdge = Edge<ExpectedLogGraphEdgeData, "expectedLog">;

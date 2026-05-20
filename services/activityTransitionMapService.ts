import "server-only";

import { queryRows } from "@/lib/db";
import {
  expectedLogTimeRanges,
  type ExpectedLogFilters,
  type ExpectedLogSpecialty,
  type ExpectedLogTimeRange,
} from "@/types/expected-log";
import type {
  ActivityTransitionMap,
  ActivityTransitionMapColumn,
  ActivityTransitionMapEdge,
  ActivityTransitionMapEdgeType,
  ActivityTransitionMapNode,
} from "@/types/activity-transition-map";
import { normalizeExpectedLogFilters } from "@/lib/expected-log-filters";

type PathwayTransitionRow = {
  entry_point_name: string;
  entry_point_priority: string | null;
  case_priority: string | null;
  path_variant: string | null;
  current_state: string;
  next_state: string;
  probability: number;
  action_type: string;
  is_terminal_state: boolean;
  max_repeat_count: number;
};

type DemandRow = {
  next_state: string;
  total_estimated_events: number;
};

const ENTRY_POINT_NAMES = [
  "Emerg_Admit",
  "Emerg_Sent_To_Or",
  "Referral",
  "New Clinic Visit",
] as const;

const COLUMN_BY_STATE: Record<string, ActivityTransitionMapColumn> = {
  Emerg_Admit: 1,
  Emerg_Sent_To_Or: 1,
  Referral: 1,
  "New Clinic Visit": 2,
  CaseRequest: 2,
  "Follow-up Clinic Visit": 3,
  Surgery: 3,
  "Post-Surgery Clinic Visit": 4,
};

function entryNodeId(entryPointName: string) {
  return `entry:${entryPointName}`;
}

function activityNodeId(eventType: string) {
  return `activity:${eventType}`;
}

function formatProbabilityLabel(probability: number) {
  const pct = Math.round(probability * 1000) / 10;
  return Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
}

function inferEdgeType(
  row: PathwayTransitionRow,
  probability: number,
): ActivityTransitionMapEdgeType {
  if (row.current_state === row.entry_point_name && row.current_state === row.next_state) {
    return "repeat";
  }
  if (row.current_state === row.next_state || row.action_type.includes("repeat")) {
    return "repeat";
  }
  if (row.is_terminal_state || row.next_state.toLowerCase().includes("discharge")) {
    return "exit";
  }
  if (row.current_state === row.entry_point_name) {
    return "entry";
  }
  return probability >= 0.8 ? "primary" : "primary";
}

function activityEventCategory(state: string): ActivityTransitionMapNode["eventCategory"] {
  if (state === "Surgery" || state === "CaseRequest") return "Surgery";
  return "Outpatient";
}

function daysForTimeRange(timeRange: ExpectedLogTimeRange): number {
  return expectedLogTimeRanges.find((range) => range.value === timeRange)?.days ?? 28;
}

async function queryEntryCounts(
  specialtyFilter: string | null,
  historyDays: number,
): Promise<Map<string, number>> {
  const rows = await queryRows<{
    entry_point_event_type: string;
    estimated_next_week_arrivals: number;
  }>(
    `
    SELECT
      h.event_type AS entry_point_event_type,
      ROUND(COUNT(*)::numeric / ($2::numeric / 7.0))::integer AS estimated_next_week_arrivals
    FROM "FactHospitalEvent" h
    WHERE h.event_type = ANY($3::text[])
      AND h.start_datetime >= CURRENT_DATE - ($2::integer * INTERVAL '1 day')
      AND h.start_datetime < CURRENT_DATE + INTERVAL '1 day'
      AND ($1::text IS NULL OR h.specialty = $1)
    GROUP BY h.event_type
  `,
    [specialtyFilter, historyDays, [...ENTRY_POINT_NAMES]],
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(
      row.entry_point_event_type,
      (counts.get(row.entry_point_event_type) ?? 0) + Number(row.estimated_next_week_arrivals),
    );
  }
  return counts;
}

async function queryDemandCounts(specialtyFilter: string | null): Promise<Map<string, number>> {
  const rows = await queryRows<DemandRow>(
    `
    SELECT
      next_state,
      ROUND(SUM(total_estimated_events))::integer AS total_estimated_events
    FROM vw_next_week_event_demand_summary
    WHERE ($1::text IS NULL OR specialty = $1)
    GROUP BY next_state
  `,
    [specialtyFilter],
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.next_state, Number(row.total_estimated_events));
  }
  return counts;
}

async function queryPathwayTransitions(
  specialtyFilter: string | null,
): Promise<PathwayTransitionRow[]> {
  return queryRows<PathwayTransitionRow>(
    `
    SELECT
      t.entry_point_name,
      t.entry_point_priority,
      t.case_priority,
      t.path_variant,
      t.current_state,
      t.next_state,
      ROUND(AVG(t.probability)::numeric, 5)::float8 AS probability,
      MIN(t.action_type) AS action_type,
      bool_or(t.is_terminal_state) AS is_terminal_state,
      MAX(t.max_repeat_count)::integer AS max_repeat_count
    FROM "FactPathwayTransition" t
    JOIN "DimPathway" p ON p.pathway_id = t.pathway_id
    WHERE t.entry_point_name = ANY($2::text[])
      AND ($1::text IS NULL OR p.specialty = $1)
    GROUP BY
      t.entry_point_name,
      t.entry_point_priority,
      t.case_priority,
      t.path_variant,
      t.current_state,
      t.next_state
  `,
    [specialtyFilter, [...ENTRY_POINT_NAMES]],
  );
}

function aggregateTransitionRows(rows: PathwayTransitionRow[]): PathwayTransitionRow[] {
  const grouped = new Map<string, { sumProb: number; count: number; row: PathwayTransitionRow }>();

  for (const row of rows) {
    const key = [
      row.entry_point_name,
      row.current_state,
      row.next_state,
      row.entry_point_priority ?? "",
      row.case_priority ?? "",
      row.path_variant ?? "",
    ].join("|");
    const existing = grouped.get(key);
    if (existing) {
      existing.sumProb += row.probability;
      existing.count += 1;
    } else {
      grouped.set(key, { sumProb: row.probability, count: 1, row });
    }
  }

  const byHop = new Map<string, { sumProb: number; weight: number; row: PathwayTransitionRow }>();
  for (const { sumProb, count, row } of grouped.values()) {
    const hopKey = [row.entry_point_name, row.current_state, row.next_state].join("|");
    const probability = sumProb / count;
    const weight = 1;
    const existing = byHop.get(hopKey);
    if (existing) {
      existing.sumProb += probability * weight;
      existing.weight += weight;
    } else {
      byHop.set(hopKey, { sumProb: probability * weight, weight, row: { ...row, probability } });
    }
  }

  return Array.from(byHop.values()).map(({ sumProb, weight, row }) => ({
    ...row,
    entry_point_priority: null,
    case_priority: null,
    path_variant: null,
    probability: Math.round((sumProb / weight) * 100000) / 100000,
  }));
}

function getMockEntryCounts(filters: ExpectedLogFilters): Map<string, number> {
  const scale =
    (daysForTimeRange(filters.timeRange) / 28) *
    (filters.specialty === "All"
      ? 1
      : filters.specialty === "Orthopedics"
        ? 0.34
        : filters.specialty === "Cardiology"
          ? 0.22
          : filters.specialty === "Oncology"
            ? 0.26
            : filters.specialty === "General Surgery"
              ? 0.3
              : 0.2);

  return new Map([
    ["Emerg_Admit", Math.round(85 * scale)],
    ["Emerg_Sent_To_Or", Math.round(15 * scale)],
    ["Referral", Math.round(500 * scale)],
    ["New Clinic Visit", Math.round(40 * scale)],
  ]);
}

function getMockDemandCounts(): Map<string, number> {
  return new Map([
    ["New Clinic Visit", 420],
    ["Follow-up Clinic Visit", 310],
    ["CaseRequest", 280],
    ["Surgery", 245],
    ["Post-Surgery Clinic Visit", 190],
  ]);
}

function getMockTransitions(): PathwayTransitionRow[] {
  return [
    {
      entry_point_name: "Emerg_Sent_To_Or",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Emerg_Sent_To_Or",
      next_state: "CaseRequest",
      probability: 1,
      action_type: "create_case_request",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Emerg_Admit",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Emerg_Admit",
      next_state: "CaseRequest",
      probability: 0.85,
      action_type: "create_case_request",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Emerg_Admit",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Emerg_Admit",
      next_state: "New Clinic Visit",
      probability: 0.15,
      action_type: "schedule_new_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Referral",
      next_state: "New Clinic Visit",
      probability: 1,
      action_type: "schedule_new_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "New Clinic Visit",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "New Clinic Visit",
      next_state: "Follow-up Clinic Visit",
      probability: 1,
      action_type: "schedule_followup_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "New Clinic Visit",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "New Clinic Visit",
      next_state: "CaseRequest",
      probability: 1,
      action_type: "create_case_request",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "New Clinic Visit",
      next_state: "Follow-up Clinic Visit",
      probability: 1,
      action_type: "schedule_followup_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Emerg_Admit",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "New Clinic Visit",
      next_state: "CaseRequest",
      probability: 1,
      action_type: "create_case_request",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Follow-up Clinic Visit",
      next_state: "CaseRequest",
      probability: 1,
      action_type: "create_case_request",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "CaseRequest",
      next_state: "Surgery",
      probability: 0.9,
      action_type: "schedule_surgery",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "CaseRequest",
      next_state: "Follow-up Clinic Visit",
      probability: 0.1,
      action_type: "schedule_followup_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Follow-up Clinic Visit",
      next_state: "Surgery",
      probability: 1,
      action_type: "schedule_surgery",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Surgery",
      next_state: "Post-Surgery Clinic Visit",
      probability: 1,
      action_type: "schedule_post_surgery_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 1,
    },
    {
      entry_point_name: "Referral",
      entry_point_priority: null,
      case_priority: null,
      path_variant: null,
      current_state: "Post-Surgery Clinic Visit",
      next_state: "Post-Surgery Clinic Visit",
      probability: 0.3,
      action_type: "repeat_post_surgery_clinic_visit",
      is_terminal_state: false,
      max_repeat_count: 2,
    },
  ];
}

function buildGraph(
  filters: ExpectedLogFilters,
  entryCounts: Map<string, number>,
  demandCounts: Map<string, number>,
  transitions: PathwayTransitionRow[],
  dataMode: "mock" | "database",
): ActivityTransitionMap {
  const totalEntries = Array.from(entryCounts.values()).reduce((sum, value) => sum + value, 0);

  const entryNodes: ActivityTransitionMapNode[] = ENTRY_POINT_NAMES.map((name, index) => {
    const count = entryCounts.get(name) ?? 0;
    return {
      id: entryNodeId(name),
      type: "entry",
      label: name,
      count,
      percent: totalEntries ? Math.round((count / totalEntries) * 1000) / 10 : 0,
      column: 1,
      eventCategory: "Entry",
    };
  });

  const activityStateSet = new Set<string>();
  for (const row of transitions) {
    if (row.current_state === row.entry_point_name) {
      activityStateSet.add(row.next_state);
    } else {
      activityStateSet.add(row.current_state);
      activityStateSet.add(row.next_state);
    }
  }
  for (const state of demandCounts.keys()) {
    activityStateSet.add(state);
  }

  const activityNodes: ActivityTransitionMapNode[] = Array.from(activityStateSet)
    .sort()
    .map((state) => {
      const column = COLUMN_BY_STATE[state] ?? 2;
      return {
        id: activityNodeId(state),
        type: "activity" as const,
        label: state,
        count: demandCounts.get(state) ?? 0,
        percent: 0,
        column,
        status: "waiting" as const,
        eventCategory: activityEventCategory(state),
      };
    });

  const nodes = [...entryNodes, ...activityNodes];
  const edges: ActivityTransitionMapEdge[] = [];

  for (const row of transitions) {
    const isEntryHop = row.current_state === row.entry_point_name;
    const source = isEntryHop
      ? entryNodeId(row.entry_point_name)
      : activityNodeId(row.current_state);
    const target = activityNodeId(row.next_state);
    const edgeType = inferEdgeType(row, row.probability);
    const entryVolume = entryCounts.get(row.entry_point_name) ?? 0;
    const expectedCount = isEntryHop
      ? Math.round(entryVolume * row.probability)
      : Math.round((demandCounts.get(row.current_state) ?? 0) * row.probability);

    if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) {
      continue;
    }

    edges.push({
      id: `${source}->${target}:${row.entry_point_name}:${edgeType}`,
      source,
      target,
      probability: row.probability,
      label: formatProbabilityLabel(row.probability),
      edgeType: isEntryHop ? "entry" : edgeType,
      expectedCount,
      entryPointName: row.entry_point_name,
    });
  }

  const entryEdges: ActivityTransitionMapEdge[] = [];
  const activityEdgeGroups = new Map<string, ActivityTransitionMapEdge[]>();

  for (const edge of edges) {
    if (edge.edgeType === "entry") {
      const key = `${edge.source}|${edge.target}|${edge.entryPointName}`;
      if (!entryEdges.some((existing) => `${existing.source}|${existing.target}|${existing.entryPointName}` === key)) {
        entryEdges.push(edge);
      }
      continue;
    }
    const key = `${edge.source}|${edge.target}|${edge.edgeType}`;
    const list = activityEdgeGroups.get(key) ?? [];
    list.push(edge);
    activityEdgeGroups.set(key, list);
  }

  const mergedActivityEdges = Array.from(activityEdgeGroups.values()).map((group) => {
    const probability =
      group.reduce((sum, edge) => sum + edge.probability, 0) / Math.max(group.length, 1);
    const expectedCount = Math.round(
      group.reduce((sum, edge) => sum + edge.expectedCount, 0) / Math.max(group.length, 1),
    );
    const template = group[0];
    return {
      ...template,
      id: `${template.source}->${template.target}:${template.edgeType}`,
      probability,
      label: formatProbabilityLabel(probability),
      expectedCount,
      entryPointName: undefined,
    } satisfies ActivityTransitionMapEdge;
  });

  return {
    filters,
    nodes,
    edges: [...entryEdges, ...mergedActivityEdges],
    pathEdges: edges,
    generatedAt: new Date().toISOString(),
    dataMode,
  };
}

export async function getActivityTransitionMap(
  filters: ExpectedLogFilters,
): Promise<ActivityTransitionMap> {
  const specialtyFilter = filters.specialty === "All" ? null : filters.specialty;
  const historyDays = daysForTimeRange(filters.timeRange);

  if (process.env.DATABASE_URL) {
    try {
      const [entryCounts, demandCounts, transitions] = await Promise.all([
        queryEntryCounts(specialtyFilter, historyDays),
        queryDemandCounts(specialtyFilter),
        queryPathwayTransitions(specialtyFilter),
      ]);

      if (transitions.length) {
        return buildGraph(
          filters,
          entryCounts,
          demandCounts,
          aggregateTransitionRows(transitions),
          "database",
        );
      }
    } catch {
      // Fall through to mock data.
    }
  }

  return buildGraph(
    filters,
    getMockEntryCounts(filters),
    getMockDemandCounts(),
    getMockTransitions(),
    "mock",
  );
}

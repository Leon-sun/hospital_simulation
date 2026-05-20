import "server-only";

import { queryRows } from "@/lib/db";
import { normalizeExpectedLogFilters } from "@/lib/expected-log-filters";
import {
  expectedLogTimeRanges,
  type EntrySource,
  type ExpectedLogEdge,
  type ExpectedLogFilters,
  type ExpectedLogNode,
  type ExpectedLogTimeRange,
  type ExpectedLogTransitionOverview,
} from "@/types/expected-log";

export { normalizeExpectedLogFilters };

type HistoricalEntryVolume = {
  entryPointId: string;
  entryPointName: string;
  count: number;
};

type EntryPathwayProbability = {
  entryPointId: string;
  pathwayId: string;
  probability: number;
};

type PathwayTransition = {
  pathwayId: string;
  currentState: string;
  nextState: string;
  probability: number;
  actionType: string;
  isTerminalState: boolean;
  maxRepeatCount: number;
};

type ExpectedLogInput = {
  filters: ExpectedLogFilters;
  entryVolumes: HistoricalEntryVolume[];
  pathwayProbabilities: EntryPathwayProbability[];
  transitions: PathwayTransition[];
  dataMode: "mock" | "database";
};

const DEFAULT_FILTERS: ExpectedLogFilters = {
  timeRange: "last_4_weeks",
  specialty: "All",
};

function round(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleizeState(value: string) {
  const normalized = value
    .replace(/^ready_for_/, "")
    .replace(/^scheduled_/, "")
    .replace(/^closed_after_/, "")
    .replace(/^closed_/, "")
    .replace(/_/g, " ");

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeNodeId(state: string) {
  return slugify(state);
}

function nodeLabel(state: string) {
  return state;
}

function eventCategoryFor(state: string, transition?: PathwayTransition): ExpectedLogNode["eventCategory"] {
  if (transition?.isTerminalState) {
    return "Terminal";
  }
  if (
    state === "Surgery" ||
    state === "CaseRequest" ||
    transition?.actionType.includes("surgery") ||
    transition?.actionType.includes("case_request")
  ) {
    return "Surgery";
  }
  if (state === "Referral" || state === "Emerg_Sent_To_Or" || state === "Emerg_Admit") {
    return "Entry";
  }
  return "Outpatient";
}

function inferTransitionType(
  transition: PathwayTransition,
): ExpectedLogEdge["transitionType"] {
  if (normalizeNodeId(transition.currentState) === normalizeNodeId(transition.nextState)) {
    return "repeat";
  }
  if (
    transition.isTerminalState ||
    transition.nextState.toLowerCase().includes("discharge") ||
    transition.nextState.toLowerCase().includes("closed")
  ) {
    return "exit";
  }
  return "primary";
}

function addNode(
  nodesById: Map<string, ExpectedLogNode>,
  state: string,
  expectedCount: number,
  transition?: PathwayTransition,
) {
  const nodeId = normalizeNodeId(state);
  const eventCategory = eventCategoryFor(state, transition);
  const existing = nodesById.get(nodeId);
  if (existing) {
    existing.expectedCount += expectedCount;
    if (eventCategory === "Terminal") {
      existing.eventCategory = "Terminal";
      existing.status = "completed";
    }
    return;
  }

  nodesById.set(nodeId, {
    nodeId,
    label: nodeLabel(state),
    eventCategory,
    expectedCount,
    status: eventCategory === "Terminal" ? "completed" : "waiting",
  });
}

function addEdge(
  edgesByKey: Map<string, ExpectedLogEdge>,
  transition: PathwayTransition,
  expectedCount: number,
) {
  const source = normalizeNodeId(transition.currentState);
  const target = normalizeNodeId(transition.nextState);
  const transitionType = inferTransitionType(transition);
  const key = `${source}:${target}:${transitionType}`;
  const existing = edgesByKey.get(key);
  if (existing) {
    existing.expectedCount += expectedCount;
    existing.probability = Math.max(existing.probability, transition.probability * 100);
    return;
  }

  edgesByKey.set(key, {
    source,
    target,
    transitionType,
    probability: transition.probability * 100,
    expectedCount,
  });
}

export function calculateExpectedLogOverview(
  input: ExpectedLogInput,
): ExpectedLogTransitionOverview {
  const totalExpectedEntries = input.entryVolumes.reduce(
    (sum, source) => sum + source.count,
    0,
  );
  const entrySources: EntrySource[] = input.entryVolumes.map((source) => ({
    entryPointId: source.entryPointId,
    entryPointName: source.entryPointName,
    count: Math.round(source.count),
    percentage: totalExpectedEntries
      ? round((source.count / totalExpectedEntries) * 100)
      : 0,
  }));

  const transitionsByPathwayState = new Map<string, PathwayTransition[]>();
  for (const transition of input.transitions) {
    const key = `${transition.pathwayId}:${transition.currentState}`;
    const list = transitionsByPathwayState.get(key) ?? [];
    list.push(transition);
    transitionsByPathwayState.set(key, list);
  }

  const stateCounts = new Map<string, number>();
  for (const source of input.entryVolumes) {
    const probabilities = input.pathwayProbabilities.filter(
      (probability) => probability.entryPointId === source.entryPointId,
    );
    const candidates = probabilities.length
      ? probabilities
      : [{ entryPointId: source.entryPointId, pathwayId: "mock_pathway", probability: 1 }];

    for (const probability of candidates) {
      const key = `${probability.pathwayId}:${source.entryPointName}`;
      stateCounts.set(key, (stateCounts.get(key) ?? 0) + source.count * probability.probability);
    }
  }

  const nodesById = new Map<string, ExpectedLogNode>();
  const edgesByKey = new Map<string, ExpectedLogEdge>();
  let frontier = new Map(stateCounts);

  for (let depth = 0; depth < 10 && frontier.size; depth += 1) {
    const nextFrontier = new Map<string, number>();
    for (const [pathwayState, currentCount] of frontier.entries()) {
      const [pathwayId, currentState] = pathwayState.split(":");
      const transitions = transitionsByPathwayState.get(`${pathwayId}:${currentState}`) ?? [];

      for (const transition of transitions) {
        const transitionType = inferTransitionType(transition);
        if (transitionType === "repeat") {
          const repeatLimit = Math.max(1, transition.maxRepeatCount || 1);
          let repeatExpected = 0;
          let repeatCount = currentCount;
          for (let repeatIndex = 0; repeatIndex < repeatLimit; repeatIndex += 1) {
            repeatCount *= transition.probability;
            repeatExpected += repeatCount;
          }
          addNode(nodesById, transition.currentState, repeatExpected, transition);
          addEdge(edgesByKey, transition, repeatExpected);
          continue;
        }

        const expectedCount = currentCount * transition.probability;
        addNode(nodesById, transition.nextState, expectedCount, transition);
        addEdge(edgesByKey, transition, expectedCount);

        if (transitionType !== "exit") {
          const nextKey = `${transition.pathwayId}:${transition.nextState}`;
          nextFrontier.set(nextKey, (nextFrontier.get(nextKey) ?? 0) + expectedCount);
        }
      }
    }
    frontier = nextFrontier;
  }

  const nodes = Array.from(nodesById.values()).map((node) => ({
    ...node,
    expectedCount: Math.round(node.expectedCount),
  }));
  const edges = Array.from(edgesByKey.values()).map((edge) => ({
    ...edge,
    probability: round(edge.probability),
    expectedCount: Math.round(edge.expectedCount),
  }));

  return {
    filters: input.filters,
    entrySources,
    nodes,
    edges,
    summary: {
      totalExpectedEntries: Math.round(totalExpectedEntries),
      waitingInQueueTotal: nodes
        .filter((node) => node.status === "waiting")
        .reduce((sum, node) => sum + node.expectedCount, 0),
      followUpVisitsTotal: nodes
        .filter((node) => {
          const label = node.label.toLowerCase();
          return label.includes("follow-up") || label.includes("follow up");
        })
        .reduce((sum, node) => sum + node.expectedCount, 0),
      dischargesTotal: nodes
        .filter(
          (node) =>
            node.status === "completed" || node.label.toLowerCase().includes("discharge"),
        )
        .reduce((sum, node) => sum + node.expectedCount, 0),
    },
    generatedAt: new Date().toISOString(),
    dataMode: input.dataMode,
  };
}

function getMockInput(filters: ExpectedLogFilters): ExpectedLogInput {
  const specialtyFactor =
    filters.specialty === "All"
      ? 1
      : filters.specialty === "Orthopedics"
        ? 0.34
        : filters.specialty === "Cardiology"
          ? 0.22
          : filters.specialty === "Oncology"
            ? 0.26
            : filters.specialty === "General Surgery"
              ? 0.3
              : 0.2;
  const timeFactor =
    filters.timeRange === "last_4_weeks"
      ? 1
      : filters.timeRange === "last_3_months"
        ? 3.15
        : filters.timeRange === "last_6_months"
          ? 6.3
          : 12.6;

  const scale = specialtyFactor * timeFactor;
  return {
    filters,
    dataMode: "mock",
    entryVolumes: [
      {
        entryPointId: "emerg_admit",
        entryPointName: "Emerg_Admit",
        count: 85 * scale,
      },
      {
        entryPointId: "emerg_sent_to_or",
        entryPointName: "Emerg_Sent_To_Or",
        count: 15 * scale,
      },
      {
        entryPointId: "referral",
        entryPointName: "Referral",
        count: 500 * scale,
      },
      {
        entryPointId: "new_clinic_visit",
        entryPointName: "New Clinic Visit",
        count: 40 * scale,
      },
    ],
    pathwayProbabilities: [
      { entryPointId: "emerg_admit", pathwayId: "mock_pathway", probability: 1 },
      { entryPointId: "emerg_sent_to_or", pathwayId: "mock_pathway", probability: 1 },
      { entryPointId: "referral", pathwayId: "mock_pathway", probability: 1 },
      { entryPointId: "new_clinic_visit", pathwayId: "mock_pathway", probability: 1 },
    ],
    transitions: [
      {
        pathwayId: "mock_pathway",
        currentState: "Referral",
        nextState: "New Clinic Visit",
        probability: 1,
        actionType: "schedule_new_clinic_visit",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "New Clinic Visit",
        nextState: "Follow-up Clinic Visit",
        probability: 1,
        actionType: "schedule_followup_clinic_visit",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "Follow-up Clinic Visit",
        nextState: "CaseRequest",
        probability: 1,
        actionType: "create_case_request",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "CaseRequest",
        nextState: "Surgery",
        probability: 0.9,
        actionType: "schedule_surgery",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "CaseRequest",
        nextState: "Follow-up Clinic Visit",
        probability: 0.1,
        actionType: "schedule_followup_clinic_visit",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "Follow-up Clinic Visit",
        nextState: "Surgery",
        probability: 1,
        actionType: "schedule_surgery",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "Surgery",
        nextState: "Post-Surgery Clinic Visit",
        probability: 1,
        actionType: "schedule_post_surgery_clinic_visit",
        isTerminalState: false,
        maxRepeatCount: 1,
      },
      {
        pathwayId: "mock_pathway",
        currentState: "Post-Surgery Clinic Visit",
        nextState: "Post-Surgery Clinic Visit",
        probability: 0.3,
        actionType: "repeat_post_surgery_clinic_visit",
        isTerminalState: false,
        maxRepeatCount: 2,
      },
    ],
  };
}

type ArrivalRateRow = {
  entry_point_event_type: string;
  specialty: string;
  priority: string;
  estimated_next_week_arrivals: number;
};

type EntryPointRow = {
  entry_point_id: string;
  entry_point_name: string;
};

type PathwayProbabilityRow = {
  entry_point_id: string;
  pathway_id: string;
  probability: number;
};

type TransitionRow = {
  pathway_id: string;
  current_state: string;
  next_state: string;
  probability: number;
  action_type: string;
  is_terminal_state: boolean;
  max_repeat_count: number;
};

function daysForTimeRange(timeRange: ExpectedLogTimeRange): number {
  return expectedLogTimeRanges.find((range) => range.value === timeRange)?.days ?? 28;
}

async function queryEntryPointArrivalRates(
  specialtyFilter: string | null,
  historyDays: number,
): Promise<ArrivalRateRow[]> {
  return queryRows<ArrivalRateRow>(`
    SELECT
      h.event_type AS entry_point_event_type,
      h.specialty,
      COALESCE(h.priority, '') AS priority,
      ROUND(COUNT(*)::numeric / ($2::numeric / 7.0))::integer AS estimated_next_week_arrivals
    FROM "FactHospitalEvent" h
    WHERE h.event_type IN (
      'Emerg_Admit',
      'Emerg_Sent_To_Or',
      'Referral',
      'New Clinic Visit'
    )
      AND h.start_datetime >= CURRENT_DATE - ($2::integer * INTERVAL '1 day')
      AND h.start_datetime < CURRENT_DATE + INTERVAL '1 day'
      AND ($1::text IS NULL OR h.specialty = $1)
    GROUP BY
      h.event_type,
      h.specialty,
      COALESCE(h.priority, '')
  `, [specialtyFilter, historyDays]);
}

async function tryDatabaseInput(
  filters: ExpectedLogFilters,
): Promise<ExpectedLogInput | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const specialtyFilter = filters.specialty === "All" ? null : filters.specialty;
    const historyDays = daysForTimeRange(filters.timeRange);

    const entryPoints = await queryRows<EntryPointRow>(`
      SELECT entry_point_id::text, entry_point_name
      FROM "DimEntryPoint"
      WHERE entry_point_name IN (
        'Emerg_Admit',
        'Emerg_Sent_To_Or',
        'Referral',
        'New Clinic Visit'
      )
    `);
    if (!entryPoints.length) return null;

    const arrivals = await queryEntryPointArrivalRates(specialtyFilter, historyDays);

    const entryVolumes = entryPoints.map((entryPoint) => {
      const matching = arrivals.filter(
        (row) => row.entry_point_event_type === entryPoint.entry_point_name,
      );
      const weeklyTotal = matching.reduce(
        (sum, row) => sum + Number(row.estimated_next_week_arrivals ?? 0),
        0,
      );
      return {
        entryPointId: entryPoint.entry_point_id,
        entryPointName: entryPoint.entry_point_name,
        count: weeklyTotal,
      };
    });

    const pathwayProbabilities = await queryRows<PathwayProbabilityRow>(`
      SELECT
        epp.entry_point_id::text AS entry_point_id,
        epp.pathway_id::text AS pathway_id,
        epp.probability::float8 AS probability
      FROM "FactEntryPointPathwayProbability" epp
      JOIN "DimPathway" p ON p.pathway_id = epp.pathway_id
      WHERE (
        epp.effective_end_date IS NULL
        OR epp.effective_end_date >= CURRENT_DATE
      )
      AND ($1::text IS NULL OR p.specialty = $1)
    `, [specialtyFilter]);

    const transitions = await queryRows<TransitionRow>(`
      SELECT DISTINCT
        t.pathway_id::text AS pathway_id,
        t.current_state,
        t.next_state,
        t.probability::float8 AS probability,
        t.action_type,
        t.is_terminal_state,
        t.max_repeat_count
      FROM "FactPathwayTransition" t
      JOIN "DimPathway" p ON p.pathway_id = t.pathway_id
      WHERE ($1::text IS NULL OR p.specialty = $1)
    `, [specialtyFilter]);

    if (!transitions.length) return null;

    return {
      filters,
      dataMode: "database",
      entryVolumes,
      pathwayProbabilities: pathwayProbabilities.map((row) => ({
        entryPointId: row.entry_point_id,
        pathwayId: row.pathway_id,
        probability: Number(row.probability),
      })),
      transitions: transitions.map((row) => ({
        pathwayId: row.pathway_id,
        currentState: row.current_state,
        nextState: row.next_state,
        probability: Number(row.probability),
        actionType: row.action_type,
        isTerminalState: row.is_terminal_state,
        maxRepeatCount: row.max_repeat_count,
      })),
    };
  } catch {
    return null;
  }
}

export async function getExpectedLogOverviewFromForecast(
  filters: ExpectedLogFilters,
): Promise<ExpectedLogTransitionOverview | null> {
  if (!process.env.DATABASE_URL) return null;
  // SQL forecast views are built on a fixed 28-day arrival window.
  if (filters.timeRange !== "last_4_weeks") return null;

  try {
    const specialtyFilter = filters.specialty === "All" ? null : filters.specialty;

    const arrivals = await queryRows<ArrivalRateRow & { entry_point_id: string }>(`
      SELECT
        ep.entry_point_id::text AS entry_point_id,
        a.entry_point_event_type,
        a.specialty,
        a.priority,
        a.estimated_next_week_arrivals
      FROM vw_entry_point_arrival_rate_4w a
      JOIN "DimEntryPoint" ep
        ON ep.entry_point_name = a.entry_point_event_type
      WHERE ($1::text IS NULL OR a.specialty = $1)
    `, [specialtyFilter]);

    const forecastRows = await queryRows<{
      current_state: string;
      next_state: string;
      estimated_event_count: number;
      step_probability: number;
      action_type: string;
      is_terminal_state: boolean;
      max_repeat_count: number;
    }>(`
      SELECT
        current_state,
        next_state,
        estimated_event_count::float8 AS estimated_event_count,
        step_probability::float8 AS step_probability,
        action_type,
        is_terminal_state,
        max_repeat_count
      FROM vw_forecast_pathway_events_next_week
      WHERE ($1::text IS NULL OR specialty = $1)
    `, [specialtyFilter]);

    if (!arrivals.length && !forecastRows.length) return null;

    const totalExpectedEntries = arrivals.reduce(
      (sum, row) => sum + Number(row.estimated_next_week_arrivals),
      0,
    );

    const entryTotals = new Map<string, number>();
    for (const row of arrivals) {
      const key = row.entry_point_id;
      entryTotals.set(
        key,
        (entryTotals.get(key) ?? 0) + Number(row.estimated_next_week_arrivals),
      );
    }

    const entrySourceMap = new Map<string, EntrySource>();
    for (const row of arrivals) {
      const count = Number(row.estimated_next_week_arrivals);
      const existing = entrySourceMap.get(row.entry_point_id);
      if (existing) {
        existing.count += count;
        continue;
      }
      entrySourceMap.set(row.entry_point_id, {
        entryPointId: row.entry_point_id,
        entryPointName: row.entry_point_event_type,
        count,
        percentage: 0,
      });
    }

    const entrySourceList = Array.from(entrySourceMap.values()).map((source) => {
      const count = Math.round(source.count);
      return {
        ...source,
        count,
        percentage: totalExpectedEntries
          ? round((count / Math.round(totalExpectedEntries)) * 100)
          : 0,
      };
    });

    const nodesById = new Map<string, ExpectedLogNode>();
    const edgesByKey = new Map<string, ExpectedLogEdge>();

    for (const row of forecastRows) {
      const transition: PathwayTransition = {
        pathwayId: "database",
        currentState: row.current_state,
        nextState: row.next_state,
        probability: Number(row.step_probability),
        actionType: row.action_type,
        isTerminalState: row.is_terminal_state,
        maxRepeatCount: row.max_repeat_count,
      };
      const expectedCount = Number(row.estimated_event_count);
      addNode(nodesById, row.next_state, expectedCount, transition);
      addEdge(edgesByKey, transition, expectedCount);
    }

    for (const [entryPointId, count] of entryTotals.entries()) {
      const entryName =
        arrivals.find((row) => row.entry_point_id === entryPointId)?.entry_point_event_type ??
        entryPointId;
      addNode(nodesById, entryName, count);
    }

    return {
      filters,
      entrySources: entrySourceList,
      nodes: Array.from(nodesById.values()).map((node) => ({
        ...node,
        expectedCount: Math.round(node.expectedCount),
      })),
      edges: Array.from(edgesByKey.values()).map((edge) => ({
        ...edge,
        probability: round(edge.probability),
        expectedCount: Math.round(edge.expectedCount),
      })),
      summary: {
        totalExpectedEntries: Math.round(totalExpectedEntries),
        waitingInQueueTotal: Array.from(nodesById.values())
          .filter((node) => node.status === "waiting")
          .reduce((sum, node) => sum + Math.round(node.expectedCount), 0),
        followUpVisitsTotal: Array.from(nodesById.values())
          .filter((node) => node.label.toLowerCase().includes("follow-up"))
          .reduce((sum, node) => sum + Math.round(node.expectedCount), 0),
        dischargesTotal: Array.from(nodesById.values())
          .filter(
            (node) =>
              node.status === "completed" || node.label.toLowerCase().includes("discharge"),
          )
          .reduce((sum, node) => sum + Math.round(node.expectedCount), 0),
      },
      generatedAt: new Date().toISOString(),
      dataMode: "database",
    };
  } catch {
    return null;
  }
}

export async function getExpectedLogTransitionOverview(
  filters: ExpectedLogFilters,
): Promise<ExpectedLogTransitionOverview> {
  const databaseInput = await tryDatabaseInput(filters);
  if (databaseInput) {
    if (filters.timeRange === "last_4_weeks") {
      const forecastOverview = await getExpectedLogOverviewFromForecast(filters);
      if (forecastOverview) return forecastOverview;
    }
    return calculateExpectedLogOverview(databaseInput);
  }

  return calculateExpectedLogOverview(getMockInput(filters));
}

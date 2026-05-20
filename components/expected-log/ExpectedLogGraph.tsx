"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";

import { ActivityNode } from "@/components/expected-log/ActivityNode";
import { EntrySourceNode } from "@/components/expected-log/EntrySourceNode";
import { GraphLegend } from "@/components/expected-log/GraphLegend";
import type {
  ExpectedLogGraphEdge,
  ExpectedLogGraphNode,
} from "@/components/expected-log/graph-types";
import type {
  ActivityTransitionMap,
  ActivityTransitionMapColumn,
  ActivityTransitionMapEdge,
  ActivityTransitionMapNode,
} from "@/types/activity-transition-map";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const nodeTypes = {
  entrySource: EntrySourceNode,
  activity: ActivityNode,
} satisfies NodeTypes;

const edgeTypes = {
  expectedLog: ExpectedLogEdgeComponent,
} satisfies EdgeTypes;

const COLUMN_X: Record<ActivityTransitionMapColumn, number> = {
  1: 24,
  2: 300,
  3: 620,
  4: 940,
};

const ROW_GAP = 118;
const COLUMN_LABELS: Record<ActivityTransitionMapColumn, string> = {
  1: "Entry Sources",
  2: "Early Activity",
  3: "Middle Activity",
  4: "Post-Surgery",
};

type PositionedMapNode = ActivityTransitionMapNode & { y: number };

function layoutColumnNodes(columnNodes: ActivityTransitionMapNode[]): PositionedMapNode[] {
  const startY = 40 + Math.max(0, (4 - columnNodes.length) * 24);
  return columnNodes.map((node, index) => ({
    ...node,
    y: startY + index * ROW_GAP,
  }));
}

function toGraphNodes(
  map: ActivityTransitionMap,
  selectedEntryId: string | null,
  highlightedNodeIds: Set<string>,
): ExpectedLogGraphNode[] {
  const byColumn = new Map<ActivityTransitionMapColumn, ActivityTransitionMapNode[]>();
  for (const node of map.nodes) {
    const list = byColumn.get(node.column) ?? [];
    list.push(node);
    byColumn.set(node.column, list);
  }

  const graphNodes: ExpectedLogGraphNode[] = [];
  for (const [columnKey, columnNodes] of byColumn.entries()) {
    const column = Number(columnKey) as ActivityTransitionMapColumn;
    const laidOut = layoutColumnNodes(
      [...columnNodes].sort((a, b) => a.label.localeCompare(b.label)),
    );
    for (const node of laidOut) {
      const dimmed =
        selectedEntryId !== null &&
        !highlightedNodeIds.has(node.id) &&
        node.id !== selectedEntryId;
      graphNodes.push({
        id: node.id,
        type: node.type === "entry" ? "entrySource" : "activity",
        position: { x: COLUMN_X[column], y: node.y },
        selectable: node.type === "entry",
        selected: node.id === selectedEntryId,
        data: {
          label: node.label,
          count: node.count,
          percentage: node.percent,
          status: node.status,
          eventCategory: node.eventCategory,
          compact: node.type === "entry",
          dimmed,
        },
      });
    }
  }
  return graphNodes;
}

function computeHighlightedPath(
  pathEdges: ActivityTransitionMapEdge[],
  selectedEntryId: string,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const entryName = selectedEntryId.replace(/^entry:/, "");
  const nodeIds = new Set<string>([selectedEntryId]);
  const edgeIds = new Set<string>();
  const queue = [selectedEntryId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const edge of pathEdges) {
      if (edge.source !== current) continue;
      if (edge.entryPointName && edge.entryPointName !== entryName) continue;

      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.target)) {
        nodeIds.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return { nodeIds, edgeIds };
}

function toGraphEdges(
  displayEdges: ActivityTransitionMapEdge[],
  pathEdges: ActivityTransitionMapEdge[],
  selectedEntryId: string | null,
  highlightedEdgeIds: Set<string>,
): ExpectedLogGraphEdge[] {
  const edges = selectedEntryId
    ? pathEdges.filter((edge) => highlightedEdgeIds.has(edge.id))
    : displayEdges;

  return edges.map((edge) => {
    const isRepeat = edge.edgeType === "repeat";
    const isExit = edge.edgeType === "exit";
    const dashed = isRepeat || edge.probability < 0.8;
    const dimmed = selectedEntryId !== null && !highlightedEdgeIds.has(edge.id);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: isRepeat ? "top-source" : "right-source",
      targetHandle: isRepeat ? "top-target" : "left-target",
      type: "expectedLog",
      animated: isRepeat,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isExit ? "#3f9b6d" : "#2f6fed",
        width: 18,
        height: 18,
      },
      data: {
        label: edge.label,
        edgeType: edge.edgeType,
        probability: edge.probability,
        expectedCount: edge.expectedCount,
        entryPointName: edge.entryPointName,
        dimmed,
        dashed,
      },
    } satisfies ExpectedLogGraphEdge;
  });
}

function ExpectedLogEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<ExpectedLogGraphEdge>) {
  const dashed = data?.dashed ?? false;
  const dimmed = data?.dimmed ?? false;
  const isRepeat = data?.edgeType === "repeat";
  const stroke = data?.edgeType === "exit" ? "#3f9b6d" : "#2f6fed";

  const [path, labelX, labelY] =
    isRepeat || sourceX === targetX
      ? [
          `M ${sourceX} ${sourceY} C ${sourceX - 100} ${sourceY - 70}, ${targetX + 100} ${targetY - 70}, ${targetX} ${targetY}`,
          (sourceX + targetX) / 2,
          Math.min(sourceY, targetY) - 48,
        ]
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          curvature: 0.22,
        });

  return (
    <>
      <BaseEdge
        id={id}
        markerEnd={markerEnd}
        path={path}
        style={{
          stroke,
          strokeDasharray: dashed ? "8 6" : undefined,
          strokeLinecap: "round",
          strokeWidth: 2.6,
          opacity: dimmed ? 0.12 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "pointer-events-none absolute rounded-md border bg-white px-2 py-0.5 text-xs font-semibold shadow-panel",
            dashed ? "border-blue-200 text-blue-700" : "border-slate-200 text-slate-700",
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            opacity: dimmed ? 0.12 : 1,
          }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

type ExpectedLogGraphProps = {
  map: ActivityTransitionMap | null;
  isLoading?: boolean;
};

export function ExpectedLogGraph({ map, isLoading }: ExpectedLogGraphProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const { nodes, edges, highlight } = useMemo(() => {
    if (!map) {
      return {
        nodes: [] as ExpectedLogGraphNode[],
        edges: [] as ExpectedLogGraphEdge[],
        highlight: { nodeIds: new Set<string>(), edgeIds: new Set<string>() },
      };
    }

    const pathHighlight = selectedEntryId
      ? computeHighlightedPath(map.pathEdges, selectedEntryId)
      : { nodeIds: new Set<string>(), edgeIds: new Set<string>() };

    return {
      highlight: pathHighlight,
      nodes: toGraphNodes(map, selectedEntryId, pathHighlight.nodeIds),
      edges: toGraphEdges(
        map.edges,
        map.pathEdges,
        selectedEntryId,
        pathHighlight.edgeIds,
      ),
    };
  }, [map, selectedEntryId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: ExpectedLogGraphNode) => {
      if (node.type !== "entrySource") return;
      setSelectedEntryId((current) => (current === node.id ? null : node.id));
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedEntryId(null);
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 border-b bg-white xl:flex-row xl:items-center xl:justify-between">
        <div>
          <CardTitle>Activity Transition Map</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pathway transitions from entry sources. Click an entry to highlight its downstream path.
          </p>
        </div>
        <GraphLegend />
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[620px] bg-white">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-muted-foreground">
              Updating pathway map…
            </div>
          )}
          {!map ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No transition data available.
            </div>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
              colorMode="light"
              defaultEdgeOptions={{ type: "expectedLog" }}
              edges={edges}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.1 }}
              maxZoom={1.2}
              minZoom={0.35}
              nodeTypes={nodeTypes}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable={false}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              panOnDrag
              panOnScroll
              proOptions={{ hideAttribution: true }}
              zoomOnDoubleClick={false}
              zoomOnScroll={false}
            >
              <Background color="#dce5ef" gap={24} size={1} />
              <Controls position="bottom-right" showInteractive={false} />
              {([1, 2, 3, 4] as ActivityTransitionMapColumn[]).map((column) => (
                <Panel
                  key={column}
                  position="top-left"
                  style={{ left: COLUMN_X[column], transform: "translateX(-4px)" }}
                >
                  <div className="rounded-md border bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-panel">
                    {COLUMN_LABELS[column]}
                  </div>
                </Panel>
              ))}
              {selectedEntryId && (
                <Panel position="top-right">
                  <button
                    className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-panel hover:bg-slate-50"
                    onClick={() => setSelectedEntryId(null)}
                    type="button"
                  >
                    Show full map
                  </button>
                </Panel>
              )}
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

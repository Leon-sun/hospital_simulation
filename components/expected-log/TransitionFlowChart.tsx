import type { ExpectedLogEdge, ExpectedLogNode } from "@/types/expected-log";
import { formatNumber, formatPercent } from "@/lib/utils";
import { FlowNode } from "@/components/expected-log/FlowNode";

type TransitionFlowChartProps = {
  nodes: ExpectedLogNode[];
  edges: ExpectedLogEdge[];
};

type Point = {
  x: number;
  y: number;
};

const preferredPositions: Record<string, Point> = {
  new_clinic_visit: { x: 230, y: 210 },
  follow_up_visit: { x: 500, y: 135 },
  surgery: { x: 500, y: 330 },
  post_surgery_follow_up: { x: 760, y: 250 },
  direct_discharge: { x: 910, y: 250 },
};

function getPositions(nodes: ExpectedLogNode[]) {
  const fallbackY = [120, 250, 380, 190, 320];
  const positions: Record<string, Point> = {};
  nodes.forEach((node, index) => {
    positions[node.nodeId] =
      preferredPositions[node.nodeId] ?? {
        x: 250 + (index % 4) * 210,
        y: fallbackY[index % fallbackY.length],
      };
  });
  return positions;
}

function edgePath(source: Point, target: Point, isRepeat: boolean) {
  if (isRepeat) {
    return `M ${source.x} ${source.y - 74} C ${source.x - 150} ${source.y - 170}, ${source.x + 150} ${source.y - 170}, ${source.x} ${source.y - 74}`;
  }

  const controlOffset = Math.max(80, Math.abs(target.x - source.x) / 2);
  return `M ${source.x + 74} ${source.y} C ${source.x + controlOffset} ${source.y}, ${target.x - controlOffset} ${target.y}, ${target.x - 74} ${target.y}`;
}

function edgeLabelPoint(source: Point, target: Point, isRepeat: boolean) {
  if (isRepeat) return { x: source.x, y: source.y - 156 };
  return {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 - 18,
  };
}

export function TransitionFlowChart({ nodes, edges }: TransitionFlowChartProps) {
  const positions = getPositions(nodes);

  return (
    <div className="relative min-h-[520px] overflow-auto rounded-lg border bg-card dashboard-scrollbar">
      <div className="relative h-[520px] min-w-[1040px]">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 1040 520"
        >
          <defs>
            <marker
              id="arrow-primary"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#2f6fed" />
            </marker>
            <marker
              id="arrow-exit"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#3f9b6d" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            if (!source || !target) return null;

            const isRepeat = edge.transitionType === "repeat";
            const isExit = edge.transitionType === "exit";
            const labelPoint = edgeLabelPoint(source, target, isRepeat);

            return (
              <g key={`${edge.source}-${edge.target}-${edge.transitionType}`}>
                <path
                  d={edgePath(source, target, isRepeat)}
                  fill="none"
                  markerEnd={isRepeat ? undefined : `url(#${isExit ? "arrow-exit" : "arrow-primary"})`}
                  stroke={isExit ? "#3f9b6d" : "#2f6fed"}
                  strokeDasharray={isRepeat ? "7 7" : undefined}
                  strokeLinecap="round"
                  strokeWidth={isRepeat ? 2 : 3}
                />
                <foreignObject
                  height="48"
                  width="128"
                  x={labelPoint.x - 64}
                  y={labelPoint.y - 20}
                >
                  <div className="rounded-md border bg-background px-2 py-1 text-center text-[11px] shadow-panel">
                    <p className="font-semibold">{formatPercent(edge.probability)}</p>
                    <p className="text-muted-foreground">
                      {formatNumber(edge.expectedCount)} expected
                    </p>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const position = positions[node.nodeId];
          return (
            <FlowNode
              key={node.nodeId}
              node={node}
              style={{
                left: position.x,
                top: position.y,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

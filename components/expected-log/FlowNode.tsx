import type { CSSProperties } from "react";

import type { ExpectedLogNode } from "@/types/expected-log";
import { cn, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type FlowNodeProps = {
  node: ExpectedLogNode;
  style: CSSProperties;
};

export function FlowNode({ node, style }: FlowNodeProps) {
  const isTerminal = node.eventCategory === "Terminal";
  const isSurgery = node.eventCategory === "Surgery";

  return (
    <div
      className={cn(
        "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border bg-card p-3 text-center shadow-panel",
        isTerminal
          ? "h-28 w-44 rounded-lg border-emerald-300 bg-emerald-50 text-emerald-900"
          : "h-36 w-36 rounded-full",
        isSurgery && "border-cyan-300 bg-cyan-50",
      )}
      style={style}
    >
      <p className="max-w-28 text-sm font-semibold leading-5">{node.label}</p>
      <p className="mt-2 text-2xl font-semibold">{formatNumber(node.expectedCount)}</p>
      <Badge className="mt-2" variant={node.status === "completed" ? "success" : "secondary"}>
        {node.status}
      </Badge>
    </div>
  );
}

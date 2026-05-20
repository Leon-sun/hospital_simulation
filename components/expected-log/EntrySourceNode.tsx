import { ArrowRightFromLine } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExpectedLogGraphNode } from "@/components/expected-log/graph-types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

export function EntrySourceNode({ data, selected }: NodeProps<ExpectedLogGraphNode>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-panel transition-opacity",
        data.compact ? "w-40 px-3 py-2.5" : "w-52 px-4 py-3",
        data.dimmed && "opacity-20",
        selected && "ring-2 ring-blue-500 ring-offset-2",
      )}
    >
      <Handle
        className="!right-0 !h-2.5 !w-2.5 !translate-x-1/2 !border-2 !border-white !bg-slate-500"
        id="right-source"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-semibold text-slate-900",
              data.compact ? "text-xs" : "text-sm",
            )}
          >
            {data.label}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Entry
          </p>
        </div>
        <div className="rounded-md bg-blue-50 p-1.5 text-blue-700">
          <ArrowRightFromLine className={data.compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={cn("font-semibold text-slate-950", data.compact ? "text-lg" : "text-2xl")}>
          {formatNumber(data.count)}
        </p>
        <p className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {formatPercent(data.percent ?? 0)}
        </p>
      </div>
    </div>
  );
}

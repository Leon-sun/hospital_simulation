import { Activity, Scissors } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExpectedLogGraphNode } from "@/components/expected-log/graph-types";
import { cn, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function ActivityNode({ data }: NodeProps<ExpectedLogGraphNode>) {
  const isSurgery = data.eventCategory === "Surgery";
  const Icon = isSurgery ? Scissors : Activity;

  return (
    <div
      className={cn(
        "relative flex h-32 w-36 flex-col items-center justify-center rounded-[24px] border-2 bg-white px-3 text-center shadow-panel transition-opacity",
        isSurgery ? "border-cyan-400 bg-cyan-50/70" : "border-blue-400",
        data.dimmed && "opacity-20",
      )}
    >
      <Handle
        className="!left-0 !h-2.5 !w-2.5 !-translate-x-1/2 !border-2 !border-white !bg-slate-500"
        id="left-target"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <Handle
        className="!right-0 !h-2.5 !w-2.5 !translate-x-1/2 !border-2 !border-white !bg-slate-500"
        id="right-source"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
      <Handle
        className="!h-2 !w-2 !border-0 !bg-transparent"
        id="top-source"
        isConnectable={false}
        position={Position.Top}
        type="source"
      />
      <Handle
        className="!h-2 !w-2 !border-0 !bg-transparent"
        id="top-target"
        isConnectable={false}
        position={Position.Top}
        type="target"
      />
      <div
        className={cn(
          "mb-2 flex h-8 w-8 items-center justify-center rounded-md",
          isSurgery ? "bg-cyan-100 text-cyan-700" : "bg-blue-50 text-blue-700",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold leading-5 text-slate-950">{data.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {formatNumber(data.count)}
      </p>
      <Badge className="mt-2 capitalize" variant={data.status === "completed" ? "success" : "secondary"}>
        {data.status ?? "waiting"}
      </Badge>
    </div>
  );
}

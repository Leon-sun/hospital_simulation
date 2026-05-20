import { CheckCircle2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExpectedLogGraphNode } from "@/components/expected-log/graph-types";
import { formatNumber } from "@/lib/utils";

export function ExitNode({ data }: NodeProps<ExpectedLogGraphNode>) {
  return (
    <div className="w-52 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950 shadow-panel">
      <Handle
        className="!h-2 !w-2 !border-0 !bg-transparent"
        id="left-target"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <Handle
        className="!h-2 !w-2 !border-0 !bg-transparent"
        id="bottom-source"
        isConnectable={false}
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className="!h-2 !w-2 !border-0 !bg-transparent"
        id="top-target"
        isConnectable={false}
        position={Position.Top}
        type="target"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{data.label}</p>
          <p className="mt-1 text-xs text-emerald-700">{data.detail ?? "Exit / Discharge"}</p>
        </div>
        <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold">{formatNumber(data.count)}</p>
    </div>
  );
}

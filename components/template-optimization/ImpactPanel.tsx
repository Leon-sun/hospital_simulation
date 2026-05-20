import { ArrowRight, Clock3, Gauge, TrendingDown, Users } from "lucide-react";

import type { TemplateImpact } from "@/types/template-optimization";
import { formatPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ImpactPanelProps = {
  impact: TemplateImpact;
};

function MetricRow({
  current,
  icon: Icon,
  label,
  suggested,
  unit,
}: {
  current: number;
  icon: typeof TrendingDown;
  label: string;
  suggested: number;
  unit: "percent" | "months";
}) {
  const currentLabel = unit === "percent" ? formatPercent(current) : `${current.toFixed(1)} mo`;
  const suggestedLabel =
    unit === "percent" ? formatPercent(suggested) : `${suggested.toFixed(1)} mo`;

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-blue-700" />
        {label}
      </div>
      <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
        <span>{currentLabel}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-emerald-700">{suggestedLabel}</span>
      </div>
    </div>
  );
}

export function ImpactPanel({ impact }: ImpactPanelProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Expected Impact</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Modeled impact from outpatient template reallocation.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        <MetricRow
          current={impact.percentOverStandard.current}
          icon={TrendingDown}
          label="% patients exceeding standard wait time"
          suggested={impact.percentOverStandard.suggested}
          unit="percent"
        />
        <MetricRow
          current={impact.averageWaitMonths.current}
          icon={Clock3}
          label="Average wait time"
          suggested={impact.averageWaitMonths.suggested}
          unit="months"
        />
        <div className="grid gap-3">
          <div className="rounded-lg border bg-blue-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
              <Users className="h-4 w-4" />
              New clinic visit access
            </div>
            <p className="mt-2 text-lg font-semibold text-blue-900">
              {impact.newClinicVisitAccess}
            </p>
          </div>
          <div className="rounded-lg border bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Follow-up clinic wait time
            </p>
            <p className="mt-2 text-lg font-semibold text-amber-900">
              {impact.followUpClinicWaitTime}
            </p>
          </div>
          <div className="rounded-lg border bg-emerald-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
              <Gauge className="h-4 w-4" />
              Capacity utilization
            </div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-emerald-900">
              <span>{formatPercent(impact.capacityUtilization.current)}</span>
              <ArrowRight className="h-4 w-4" />
              <span>{formatPercent(impact.capacityUtilization.suggested)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

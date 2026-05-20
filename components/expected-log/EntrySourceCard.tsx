import { ArrowRight } from "lucide-react";

import type { EntrySource } from "@/types/expected-log";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type EntrySourceCardProps = {
  source: EntrySource;
};

export function EntrySourceCard({ source }: EntrySourceCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{source.entryPointName}</p>
            <p className="mt-1 text-xs text-muted-foreground">Historical entry source</p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 flex items-end justify-between">
          <p className="text-2xl font-semibold">{formatNumber(source.count)}</p>
          <p className="text-sm font-medium text-muted-foreground">
            {formatPercent(source.percentage)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

import { CheckCircle2, Clock3, GitBranch, Repeat2 } from "lucide-react";

import type { ExpectedLogSummary } from "@/types/expected-log";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type ExpectedLogSummaryCardsProps = {
  summary: ExpectedLogSummary;
};

const cards = [
  {
    label: "Total Expected Entries",
    key: "totalExpectedEntries",
    icon: GitBranch,
    tone: "bg-blue-50 text-blue-700",
  },
  {
    label: "Waiting In Queue",
    key: "waitingInQueueTotal",
    icon: Clock3,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    label: "Follow-up Visits",
    key: "followUpVisitsTotal",
    icon: Repeat2,
    tone: "bg-cyan-50 text-cyan-700",
  },
  {
    label: "Discharges",
    key: "dischargesTotal",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700",
  },
] as const;

export function ExpectedLogSummaryCards({ summary }: ExpectedLogSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardContent className="flex min-h-32 items-start justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-normal">
                {formatNumber(summary[card.key])}
              </p>
            </div>
            <div className={`rounded-md p-2 ${card.tone}`}>
              <card.icon className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

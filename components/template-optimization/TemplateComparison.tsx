import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import type {
  TemplateCapacityBalance,
  TemplateComparisonRow,
} from "@/types/template-optimization";
import { cn, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TemplateComparisonProps = {
  capacityBalance: TemplateCapacityBalance;
  rows: TemplateComparisonRow[];
};

function changeTone(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-amber-700";
  return "text-muted-foreground";
}

function formatChange(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function ChangeCell({ value }: { value: number }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className={cn("inline-flex items-center justify-end gap-1 font-semibold", changeTone(value))}>
      <Icon className="h-3.5 w-3.5" />
      {formatChange(value)}
    </span>
  );
}

export function TemplateComparison({ capacityBalance, rows }: TemplateComparisonProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Template Comparison</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Slot and minute deltas by outpatient visit-duration block.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Visit Type</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Current Slots</TableHead>
              <TableHead className="text-right">Suggested Slots</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Current Minutes</TableHead>
              <TableHead className="text-right">Suggested Minutes</TableHead>
              <TableHead className="text-right">Minute Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`comparison-${row.id}`}>
                <TableCell className="font-medium">{row.visitType}</TableCell>
                <TableCell className="text-right">{row.durationMin} min</TableCell>
                <TableCell className="text-right">{row.currentSlots}</TableCell>
                <TableCell className="text-right font-semibold">
                  {row.suggestedSlots}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeCell value={row.slotChange} />
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(row.currentMinutes)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(row.suggestedMinutes)}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeCell value={row.minuteChange} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-5 py-4">
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Current capacity</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(capacityBalance.currentMinutesPerWeek)} min/week
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suggested capacity</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(capacityBalance.suggestedMinutesPerWeek)} min/week
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Difference</p>
                <p className={cn("mt-1 font-semibold", changeTone(capacityBalance.differenceMinutesPerWeek))}>
                  {formatChange(capacityBalance.differenceMinutesPerWeek)} min/week
                </p>
              </div>
            </div>
            <p className="mt-3 leading-6 text-muted-foreground">
              {capacityBalance.explanation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

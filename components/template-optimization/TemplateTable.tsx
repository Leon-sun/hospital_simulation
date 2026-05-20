import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import type { OutpatientTemplateSlot } from "@/types/template-optimization";
import { cn, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SlotVisualization } from "@/components/template-optimization/SlotVisualization";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TemplateTableProps = {
  description: string;
  rows: OutpatientTemplateSlot[];
  title: string;
  variant: "current" | "suggested";
};

function formatChange(change = 0) {
  if (change > 0) return `+${change}`;
  return `${change}`;
}

function ChangePill({ value }: { value?: number }) {
  if (value === undefined) return null;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
        value > 0 && "bg-emerald-50 text-emerald-700",
        value < 0 && "bg-amber-50 text-amber-700",
        value === 0 && "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {formatChange(value)}
    </span>
  );
}

export function TemplateTable({ description, rows, title, variant }: TemplateTableProps) {
  const totalSlots = rows.reduce((sum, row) => sum + row.slotsPerWeek, 0);
  const totalMinutes = rows.reduce((sum, row) => sum + row.totalMinutesPerWeek, 0);
  const showChange = variant === "suggested";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 border-b sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-right text-sm text-blue-800">
          <p className="font-semibold">{formatNumber(totalSlots)} slots/week</p>
          <p className="text-xs">{formatNumber(totalMinutes)} min/week</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="px-2">Visit Type</TableHead>
              <TableHead className="px-2 text-right">Duration</TableHead>
              <TableHead className="px-2 text-right">Slots / Week</TableHead>
              <TableHead className="px-2 text-right">Total Minutes / Week</TableHead>
              {showChange ? <TableHead className="px-2 text-right">Change</TableHead> : null}
              <TableHead className="px-2">Visual Representation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${variant}-${row.id}`}>
                <TableCell className="px-2 font-medium">{row.visitType}</TableCell>
                <TableCell className="px-2 text-right">{row.durationMin} min</TableCell>
                <TableCell className="px-2 text-right font-semibold">
                  {row.slotsPerWeek}
                </TableCell>
                <TableCell className="px-2 text-right">
                  {formatNumber(row.totalMinutesPerWeek)}
                </TableCell>
                {showChange ? (
                  <TableCell className="px-2 text-right">
                    <ChangePill value={row.slotChange} />
                  </TableCell>
                ) : null}
                <TableCell className="px-2">
                  <SlotVisualization
                    slotsPerWeek={row.slotsPerWeek}
                    visitType={row.visitType}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

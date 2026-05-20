"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WaitTimeDistributionPoint } from "@/lib/dashboard-types";
import { formatNumber } from "@/lib/utils";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-card p-3 text-sm shadow-md">
      <p className="font-medium">{label} days</p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium">{formatNumber(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type WaitTimeDistributionChartProps = {
  data: WaitTimeDistributionPoint[];
};

export function WaitTimeDistributionChart({ data }: WaitTimeDistributionChartProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return <div aria-hidden className="h-80 w-full animate-pulse rounded-md bg-muted/40" />;
  }

  return (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -18, right: 8, top: 10 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis axisLine={false} dataKey="bucket" tickLine={false} tickMargin={10} />
        <YAxis axisLine={false} tickLine={false} tickMargin={10} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f4f6" }} />
        <Legend iconType="circle" />
        <Bar dataKey="outpatient" fill="#2f6fed" name="Outpatient" radius={[4, 4, 0, 0]} />
        <Bar dataKey="surgery" fill="#1aa6a8" name="Surgery" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

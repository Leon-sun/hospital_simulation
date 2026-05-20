export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
        <span className="h-0.5 w-8 rounded bg-chart-blue" />
        Solid arrow = Primary Flow
      </span>
      <span className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
        <span className="h-0.5 w-8 rounded border-t border-dashed border-chart-blue" />
        Dashed arrow = Possible / Repeat Flow
      </span>
      <span className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
        <span className="h-4 w-7 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" />
        Green node = Exit / Discharge
      </span>
    </div>
  );
}

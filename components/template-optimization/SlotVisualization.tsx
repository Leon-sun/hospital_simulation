import type { OutpatientVisitType } from "@/types/template-optimization";
import { cn } from "@/lib/utils";

type SlotVisualizationProps = {
  visitType: OutpatientVisitType;
  slotsPerWeek: number;
  maxSlots?: number;
};

const slotColors: Record<OutpatientVisitType, string> = {
  "New Clinic Visit": "bg-blue-500",
  "Follow-up Clinic Visit": "bg-amber-500",
  "Post-surgery Follow-up Clinic Visit": "bg-emerald-500",
};

export function SlotVisualization({
  visitType,
  slotsPerWeek,
  maxSlots = 12,
}: SlotVisualizationProps) {
  return (
    <div
      aria-label={`${slotsPerWeek} ${visitType} slots per week`}
      className="flex min-w-32 flex-wrap gap-1"
    >
      {Array.from({ length: maxSlots }).map((_, index) => (
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-[3px]",
            index < slotsPerWeek ? slotColors[visitType] : "bg-slate-200",
          )}
          key={`${visitType}-${index}`}
        />
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  templateSpecialties,
  type TemplateOptimizationResponse,
  type TemplateSpecialty,
} from "@/types/template-optimization";
import { ImpactPanel } from "@/components/template-optimization/ImpactPanel";
import { RecommendationPanel } from "@/components/template-optimization/RecommendationPanel";
import { TemplateComparison } from "@/components/template-optimization/TemplateComparison";
import { TemplateTable } from "@/components/template-optimization/TemplateTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TemplateOptimizationDashboardProps = {
  initialData: TemplateOptimizationResponse;
};


export function TemplateOptimizationDashboard({
  initialData,
}: TemplateOptimizationDashboardProps) {
  const [data, setData] = useState(initialData);
  const [specialty, setSpecialty] = useState<TemplateSpecialty>(
    initialData.filters.specialty,
  );
  const [isLoading, setIsLoading] = useState(false);

  async function loadTemplate(nextSpecialty: TemplateSpecialty) {
    setSpecialty(nextSpecialty);
    setIsLoading(true);
    const params = new URLSearchParams({ specialty: nextSpecialty });
    const response = await fetch(`/api/template-optimization/outpatient?${params}`);
    const nextData = (await response.json()) as TemplateOptimizationResponse;
    setData(nextData);
    setIsLoading(false);
  }

  function clearFilters() {
    void loadTemplate("All Specialties");
  }

  return (
    <main className="min-w-0 flex-1">
        <header className="border-b bg-background">
          <div className="space-y-4 px-4 py-5 md:px-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link className="hover:text-foreground" href="/simulation/what-if">
                Simulation
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium text-foreground">Template Optimization</span>
            </div>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-normal">
                  Template Optimization
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Rebalance outpatient clinic visit-duration templates to reduce new
                  referral backlog while protecting post-surgery follow-up capacity.
                </p>
              </div>
              <div className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-panel">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-chart-green" />
                )}
                <span>Mock outpatient template data</span>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
              <div className="grid gap-3 sm:grid-cols-[180px_260px]">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    View by
                  </p>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm font-medium">
                    <SlidersHorizontal className="h-4 w-4 text-blue-700" />
                    Specialty
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Specialty
                  </p>
                  <Select
                    onValueChange={(value) => loadTemplate(value as TemplateSpecialty)}
                    value={specialty}
                  >
                    <SelectTrigger aria-label="Specialty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateSpecialties.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={clearFilters} variant="outline">
                <RotateCcw className="h-4 w-4" />
                Clear
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              <TemplateTable
                description="Baseline weekly outpatient template by visit type and duration."
                rows={data.currentTemplate}
                title="Current Outpatient Clinic Template"
                variant="current"
              />
              <TemplateTable
                description="Recommended template mix focused on new clinic visit access."
                rows={data.suggestedTemplate}
                title="Suggested Outpatient Clinic Template"
                variant="suggested"
              />
              <TemplateComparison
                capacityBalance={data.capacityBalance}
                rows={data.comparison}
              />
            </div>

            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <ImpactPanel impact={data.impact} />
              <RecommendationPanel
                recommendedActions={data.recommendedActions}
                whyThisWorks={data.whyThisWorks}
              />
            </aside>
          </div>
        </div>
    </main>
  );
}

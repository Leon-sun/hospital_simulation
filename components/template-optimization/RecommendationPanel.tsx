import { CheckCircle2, ExternalLink, Lightbulb, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RecommendationPanelProps = {
  recommendedActions: string[];
  whyThisWorks: string[];
};

export function RecommendationPanel({
  recommendedActions,
  whyThisWorks,
}: RecommendationPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-600" />
            Why This Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          {whyThisWorks.map((reason) => (
            <div className="flex gap-3 text-sm leading-6" key={reason}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>{reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-700" />
            Recommended Action
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-3">
            {recommendedActions.map((action) => (
              <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6" key={action}>
                {action}
              </div>
            ))}
          </div>
          <Button className="w-full">Apply Suggested Template</Button>
          <Button className="w-full" variant="ghost">
            View alternative templates
            <ExternalLink className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

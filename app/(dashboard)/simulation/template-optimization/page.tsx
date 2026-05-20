import { TemplateOptimizationDashboard } from "@/components/template-optimization/TemplateOptimizationDashboard";
import { getOutpatientTemplateOptimization } from "@/lib/template-optimization-data";

export default function TemplateOptimizationPage() {
  const initialData = getOutpatientTemplateOptimization("All Specialties");

  return <TemplateOptimizationDashboard initialData={initialData} />;
}

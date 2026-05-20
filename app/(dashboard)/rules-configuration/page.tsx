import type { Metadata } from "next";
import { RulesConfigurationDashboard } from "@/components/rules-configuration/RulesConfigurationDashboard";

export const metadata: Metadata = {
  title: "Rules Configuration | Hospital Scheduling Simulation",
  description:
    "Configure how appointment requests compete for limited slots by appointment type.",
};

export default function RulesConfigurationPage() {
  return <RulesConfigurationDashboard />;
}

import {
  Activity,
  BarChart3,
  Bot,
  CalendarClock,
  GitBranch,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DashboardAppNavItem =
  | {
      label: string;
      href: string;
      icon: LucideIcon;
    }
  | {
      label: string;
      icon: LucideIcon;
      children: Array<{
        label: string;
        href: string;
      }>;
    };

export const DASHBOARD_APP_NAV_ITEMS: DashboardAppNavItem[] = [
  { label: "Overview", href: "/case-requests", icon: LayoutDashboard },
  { label: "Expected Log", href: "/simulation/expected-log", icon: GitBranch },
  { label: "Clinic Visit", href: "#", icon: CalendarClock },
  {
    label: "Simulation",
    icon: Activity,
    children: [
      { label: "What-if Simulation", href: "/simulation/what-if" },
      { label: "Template Optimization", href: "/simulation/template-optimization" },
      { label: "Saved Scenarios", href: "/simulation/what-if#saved-scenarios" },
    ],
  },
  { label: "AI Reports", href: "#", icon: Bot },
  {
    label: "Analytics",
    icon: BarChart3,
    children: [{ label: "Rules Configuration", href: "/rules-configuration" }],
  },
  { label: "Settings", href: "#", icon: Settings },
];

export function isNavChildActive(pathname: string, href: string) {
  if (href.includes("#")) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavLinkActive(pathname: string, href: string) {
  if (href === "#") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

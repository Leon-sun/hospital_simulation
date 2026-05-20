"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  Sparkles,
  Stethoscope,
} from "lucide-react";

import { useSidebarState } from "@/components/layout/sidebar-state";
import {
  DASHBOARD_APP_NAV_ITEMS,
  isNavChildActive,
  isNavLinkActive,
} from "@/lib/dashboard-nav-config";
import { cn } from "@/lib/utils";

export { DASHBOARD_APP_NAV_ITEMS } from "@/lib/dashboard-nav-config";
export type { DashboardAppNavItem } from "@/lib/dashboard-nav-config";

function SidebarFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/simulation/what-if")) {
    return (
      <div className="space-y-3 rounded-lg bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-chart-amber" />
          Scenario model
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Current planning baseline with 1000 scheduling events.
        </p>
      </div>
    );
  }

  if (pathname.startsWith("/simulation/template-optimization")) {
    return (
      <div className="rounded-lg bg-background p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Optimization scope
        </p>
        <p className="mt-2 text-sm font-semibold">Outpatient clinic templates</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Visit-duration slots only. Surgical templates are excluded.
        </p>
      </div>
    );
  }

  if (pathname.startsWith("/simulation/expected-log")) {
    return (
      <div className="space-y-3 rounded-lg bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-chart-cyan" />
          Activity transitions
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Expected flow and transition probabilities from historical pathways.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <LayoutDashboard className="h-4 w-4 text-chart-blue" />
        Queue KPIs
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Backlog, wait times, and surgical queue status from scheduling events.
      </p>
    </div>
  );
}

export function DashboardAppSidebar() {
  const pathname = usePathname();
  const { isGroupExpanded, toggleGroup } = useSidebarState();

  return (
    <aside className="hidden w-72 shrink-0 border-r bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">CareFlow Sim</p>
          <p className="text-xs text-muted-foreground">Queue performance</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {DASHBOARD_APP_NAV_ITEMS.map((item) => (
          <div key={item.label}>
            {"href" in item ? (
              <Link
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isNavLinkActive(pathname, item.href) &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                href={item.href}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  aria-expanded={isGroupExpanded(item.label)}
                  className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => toggleGroup(item.label)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <ChevronRight
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 transition-transform",
                      isGroupExpanded(item.label) && "rotate-90",
                    )}
                  />
                </button>
                {isGroupExpanded(item.label) ? (
                  <div className="ml-7 mt-1 space-y-1 border-l pl-3">
                    {item.children.map((child) => (
                      <Link
                        className={cn(
                          "flex h-9 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                          isNavChildActive(pathname, child.href) &&
                            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                        )}
                        href={child.href}
                        key={child.label}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </nav>
      <div className="border-t p-4">
        <SidebarFooter />
      </div>
    </aside>
  );
}

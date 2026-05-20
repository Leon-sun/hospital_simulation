"use client";

import { DashboardAppSidebar } from "@/components/layout/DashboardAppSidebar";
import { SidebarStateProvider } from "@/components/layout/sidebar-state";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarStateProvider>
      <div className="flex min-h-screen bg-background">
        <DashboardAppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarStateProvider>
  );
}

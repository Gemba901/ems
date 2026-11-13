"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PlanningProgrammeShell } from "@/components/leadership-excellence/performance-planning/PlanningProgrammeShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/ModuleGuard";
import { LexSidebar } from "@/components/leadership-excellence/LexSidebar";
import { LexAreaNav } from "@/components/leadership-excellence/LexAreaNav";
import { LexHeader } from "@/components/leadership-excellence/LexHeader";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

// Shared navigation connects the existing seven areas; each area owns its pages.
export default function LeadershipExcellenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const pathname = usePathname();
  if (pathname.startsWith("/leadership-excellence/performance-planning"))
    return (
      <ProtectedRoute>
        <ModuleGuard moduleKey="LEADERSHIP_EXCELLENCE">
          <PlanningProgrammeShell>{children}</PlanningProgrammeShell>
        </ModuleGuard>
      </ProtectedRoute>
    );
  return (
    <ProtectedRoute>
      <ModuleGuard moduleKey="LEADERSHIP_EXCELLENCE">
        <div className="min-h-screen bg-[#F4F7FA] font-sans">
          <LexSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={collapsed}
            onToggle={toggle}
          />
          <div
            className={`flex min-h-screen min-w-0 flex-col transition-all duration-300 ${collapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}
          >
            <LexHeader onMenuClick={() => setSidebarOpen(true)} />
            <LexAreaNav />
            <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
          </div>
        </div>
      </ModuleGuard>
    </ProtectedRoute>
  );
}

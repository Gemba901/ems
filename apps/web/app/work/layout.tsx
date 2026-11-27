"use client";

import { SIDEBAR_PADDING } from "@/components/shell/ModuleSidebar";

import { useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Header, SkipToMainContent } from "@/components/Header";
import { ModuleGuard } from "@/components/ModuleGuard";
import { WorkSidebar } from "@/components/work/WorkSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  return (
    <ProtectedRoute>
    <ModuleGuard moduleKey="WORK">
      <div className="min-h-screen bg-background font-sans">
        <SkipToMainContent />
        <WorkSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className={`flex min-h-screen flex-col ${sidebarCollapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
          <Header menuId="work-sidebar" menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
          <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
    </ProtectedRoute>
  );
}

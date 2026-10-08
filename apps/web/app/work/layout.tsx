"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Header } from "@/components/Header";
import { ModuleGuard } from "@/components/ModuleGuard";
import { WorkSidebar } from "@/components/work/WorkSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  return (
    <ProtectedRoute>
    <ModuleGuard moduleKey="WORK">
      <div className="min-h-screen bg-[#F4F7FA] font-sans">
        <WorkSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className={`flex min-h-screen flex-col ${sidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-64"}`}>
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
    </ProtectedRoute>
  );
}

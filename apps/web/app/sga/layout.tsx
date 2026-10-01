"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { SgaSidebar } from "@/components/sga/SgaSidebar";
import { ModuleGuard } from "@/components/ModuleGuard";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

// Same shell as the DWMS layout: a full sidebar that collapses to an icon rail on desktop.
export default function SgaLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  return (
    <ModuleGuard moduleKey="SGA">
      <div className="min-h-screen bg-[#F4F7FA] font-sans">
        <SgaSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className={`flex min-h-screen flex-col ${sidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-64"}`}>
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}

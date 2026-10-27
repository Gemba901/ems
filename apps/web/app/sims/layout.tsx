"use client";

import { useState } from "react";
import { SimsSidebar } from "@/components/sims/SimsSidebar";
import { Header } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { ModuleGuard } from "@/components/ModuleGuard";

// Same shell as the Kaizen/SGA layouts: a full sidebar that collapses to an icon rail on desktop.
export default function SimsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <ModuleGuard moduleKey="SIMS">
      <div className="min-h-screen bg-[#F4F7FA] font-sans">
        <SimsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
        <div className={`flex min-h-screen flex-col ${collapsed ? "lg:pl-[88px]" : "lg:pl-64"}`}>
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ModuleGuard>
  );
}

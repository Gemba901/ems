"use client";

import { useState } from "react";
import { SimsSidebar } from "@/components/sims/SimsSidebar";
import { Header } from "@/components/Header";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { ModuleGuard } from "@/components/ModuleGuard";

export default function SimsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <SimsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1">
          <ModuleGuard moduleKey="SIMS">{children}</ModuleGuard>
        </main>
      </div>
    </div>
  );
}
